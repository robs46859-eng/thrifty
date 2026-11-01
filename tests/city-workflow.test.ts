import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ResearchCache,
  ResearchBudgetError,
  newDraft,
  publication,
  publishDraft,
  censusProposal,
  publicSourceUrl,
  publicIP,
} from '../scripts/lib/city-workflow';
import { cityProfileSchema } from '../src/lib/regions';
import { catalogueSchema } from '../src/lib/catalogue';
import { marketSeason } from '../src/lib/discovery';
import { generateRegistry } from '../scripts/generate-catalogues.mjs';
const now = new Date('2026-11-01T18:00:00Z');
const city = cityProfileSchema.parse({
  id: 'portland-or',
  city: 'Portland',
  state: 'OR',
  country: 'US',
  timezone: 'America/Los_Angeles',
  center: { lat: 45.523, lng: -122.676 },
  radiusKm: 20,
});
async function temporary(fn: (root: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thrifty-city-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function reviewedDraft() {
  const d = newDraft(city);
  d.sources = [
    {
      id: 'operator',
      url: 'https://example.com/directory',
      label: 'Local test source',
      categories: ['thrift', 'market', 'vintage'],
    },
  ];
  for (const kind of ['thrift', 'market', 'vintage'])
    for (let n = 0; n < 3; n++)
      d.candidates.push({
        country: 'US',
        state: 'OR',
        place: {
          id: `official:portland-or:fixture-${kind}-${n}`,
          name: `Test-only ${kind} ${n}`,
          kind,
          ...city.center,
          address: '100 N Test St, Portland, OR',
          description: 'Isolated test fixture. Never a production listing.',
          hours: '',
          source: 'official',
          sourceUrl: d.sources[0].url,
          website: d.sources[0].url,
          sourceLabel: 'Local test source',
          checkedAt: '2026-11-01',
          coordinateNote: 'Test fixture point',
          tags: [],
        },
        review: {
          status: 'approved',
          reviewer: 'Automated fixture',
          reviewedAt: '2026-11-01',
          evidence: [
            {
              url: d.sources[0].url,
              fields: ['name', 'address', 'category', 'coordinates'],
              note: 'Test evidence only',
            },
          ],
        },
      });
  return d;
}
describe('conservative research cache', () => {
  it('reuses sources across runs without a request and uses conditional requests when stale', async () =>
    temporary(async (root) => {
      let time = now.getTime();
      const transport = vi
        .fn()
        .mockResolvedValue({ status: 200, body: 'Public source', etag: 'etag-1' });
      const first = new ResearchCache(root, transport, () => time);
      await first.get('https://example.com/source');
      const second = new ResearchCache(root, transport, () => time);
      expect((await second.get('https://example.com/source')).cacheHit).toBe(true);
      expect(second.requests).toBe(0);
      time += 8 * 86400000;
      transport.mockResolvedValue({ status: 304, body: '' });
      const next = await second.get('https://example.com/source');
      expect(transport.mock.calls[1][1]).toMatchObject({ 'If-None-Match': 'etag-1' });
      expect(next.changed).toBe(false);
      expect(next.body).toBe('Public source');
      expect(transport).toHaveBeenCalledTimes(2);
    }));
  it('stops after six run requests and twelve daily requests across runs', async () =>
    temporary(async (root) => {
      const transport = vi.fn().mockResolvedValue({ status: 200, body: 'page' });
      const first = new ResearchCache(root, transport, () => now.getTime());
      for (let i = 0; i < 6; i++) await first.get(`https://example.com/a${i}`);
      await expect(first.get('https://example.com/seventh')).rejects.toBeInstanceOf(
        ResearchBudgetError,
      );
      const second = new ResearchCache(root, transport, () => now.getTime());
      for (let i = 0; i < 6; i++) await second.get(`https://example.com/b${i}`);
      await expect(
        new ResearchCache(root, transport, () => now.getTime()).get('https://example.com/extra'),
      ).rejects.toThrow('Daily limit');
      expect(transport).toHaveBeenCalledTimes(12);
    }));
  it('never retries failed sources during cooldown, preserves cache, and caps payloads', async () =>
    temporary(async (root) => {
      const transport = vi.fn().mockResolvedValue({ status: 403, body: 'blocked' });
      await expect(
        new ResearchCache(root, transport, () => now.getTime()).get('https://example.com/blocked'),
      ).rejects.toThrow('HTTP 403');
      await expect(
        new ResearchCache(root, transport, () => now.getTime()).get('https://example.com/blocked'),
      ).rejects.toThrow('cooling down');
      expect(transport).toHaveBeenCalledTimes(1);
      transport.mockResolvedValue({ status: 200, body: 'x'.repeat(1024 * 1024 + 1) });
      await expect(
        new ResearchCache(root, transport, () => now.getTime()).get('https://example.com/huge'),
      ).rejects.toThrow('1 MB');
    }));
  it('rejects credentials, localhost, private networks and foreign plans', () => {
    for (const url of [
      'http://example.com',
      'https://localhost',
      'https://127.0.0.1',
      'https://user:pass@example.com',
      'https://example.com?api_key=secret',
    ])
      expect(() => publicSourceUrl(url)).toThrow();
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '169.254.1.1',
      '172.16.0.1',
      '192.168.0.1',
      '::1',
      '::ffff:127.0.0.1',
      'fd00::1',
      'fe80::1',
    ])
      expect(publicIP(ip)).toBe(false);
    expect(publicIP('8.8.8.8')).toBe(true);
    expect(publicSourceUrl('https://example.com/?utm_source=x')).toBe('https://example.com/');
    expect(cityProfileSchema.safeParse({ ...city, country: 'GB' }).success).toBe(false);
    expect(cityProfileSchema.safeParse({ ...city, state: 'ON' }).success).toBe(false);
    expect(cityProfileSchema.safeParse({ ...city, center: { lat: 51.5, lng: -0.1 } }).success).toBe(
      false,
    );
  });
});
describe('city review and publication', () => {
  it('keeps Colorado and non-Colorado starter plans unpublished', () => {
    for (const profile of [
      city,
      {
        ...city,
        id: 'boulder-co',
        city: 'Boulder',
        state: 'CO',
        timezone: 'America/Denver',
        center: { lat: 40.015, lng: -105.2705 },
      },
    ]) {
      const d = newDraft(cityProfileSchema.parse(profile));
      expect(d.candidates).toEqual([]);
      expect(() => publication(d, now)).toThrow('three approved');
    }
  });
  it('blocks incomplete evidence, wrong states, stale dates, duplicate IDs and wrong timezones', () => {
    const d = reviewedDraft();
    expect(publication(d, now).places).toHaveLength(9);
    d.candidates[0].review.evidence = [];
    expect(() => publication(d, now)).toThrow('evidence');
    const badState = reviewedDraft();
    badState.candidates[0].state = 'CO';
    expect(() => publication(badState, now)).toThrow('state');
    expect(() => publication(reviewedDraft(), new Date('2026-12-04T12:00:00Z'))).toThrow('overdue');
    const duplicate = reviewedDraft();
    duplicate.candidates[1].place.id = duplicate.candidates[0].place.id;
    expect(() => publication(duplicate, now)).toThrow();
    const zone = reviewedDraft();
    zone.candidates[0].place.season = {
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      timezone: 'America/Denver',
    };
    zone.candidates[0].review.evidence[0].fields.push('season');
    expect(() => publication(zone, now)).toThrow('timezone');
  });
  it('publishes only approved fixtures in an isolated checkout and registers a new city without manual imports', async () =>
    temporary(async (root) => {
      await mkdir(path.join(root, 'data/cities'), { recursive: true });
      const target = await publishDraft(reviewedDraft(), root, false, now);
      expect(catalogueSchema.parse(JSON.parse(await readFile(target, 'utf8'))).cityProfile.id).toBe(
        'portland-or',
      );
      await expect(publishDraft(reviewedDraft(), root, false, now)).rejects.toThrow();
      await generateRegistry(root);
      expect(await readFile(path.join(root, 'src/generated/catalogues.ts'), 'utf8')).toContain(
        '../../data/cities/portland-or.json',
      );
      await generateRegistry(root, true);
    }));
  it('rejects geocoder direction/state mismatches and uses local market calendar dates', () => {
    const raw = (state: string, address: string) => ({
      result: {
        addressMatches: [
          {
            matchedAddress: address,
            addressComponents: { state },
            coordinates: { x: -122.67, y: 45.52 },
          },
        ],
      },
    });
    expect(() =>
      censusProposal(raw('WA', '100 N TEST ST'), '100 N Test St, Portland, OR', 'OR'),
    ).toThrow('state');
    expect(() =>
      censusProposal(raw('OR', '100 S TEST ST'), '100 N Test St, Portland, OR', 'OR'),
    ).toThrow('direction');
    expect(
      censusProposal(raw('OR', '100 N TEST ST'), '100 N Test St, Portland, OR', 'OR').lat,
    ).toBe(45.52);
    const p = publication(reviewedDraft(), now).places[0];
    p.season = { startsOn: '2026-01-01', endsOn: '2026-10-31', timezone: 'America/New_York' };
    expect(marketSeason(p, new Date('2026-11-01T04:30:00Z'))).toBe('2026 season ended');
  });
});
