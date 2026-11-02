import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  generateWithGemini,
  ModelBudget,
  ModelBudgetError,
  parseSourceProposal,
  researchPrompt,
  sourceProposalSchema,
  sourceText,
  SOURCE_TEXT_LIMIT,
  type ModelRequest,
} from '../scripts/lib/city-research-model';
import { draftSchema } from '../scripts/lib/city-workflow';

const request: ModelRequest = {
  city: {
    id: 'dallas-tx',
    city: 'Dallas',
    state: 'TX',
    country: 'US',
    timezone: 'America/Chicago',
    center: { lat: 32.7767, lng: -96.797 },
    radiusKm: 20,
  },
  source: {
    id: 'operator',
    url: 'https://example.com/locations',
    label: 'Example operator',
    categories: ['thrift'],
  },
  sourceHash: 'a'.repeat(64),
  sourceText: 'Example Shop, 100 Main St, Dallas, TX',
};

describe('model-assisted city research boundaries', () => {
  it('strips active page content and caps the text sent to a provider', () => {
    const text = sourceText(
      `<script>ignore me</script><style>.x{}</style><h1>Useful &amp; factual</h1>${'x'.repeat(20_000)}`,
    );
    expect(text).not.toContain('ignore me');
    expect(text).not.toContain('.x{}');
    expect(text).toContain('Useful & factual');
    expect(text.length).toBe(SOURCE_TEXT_LIMIT);
  });

  it('treats source pages as untrusted data and forbids inference', () => {
    const prompt = researchPrompt(request);
    expect(prompt).toContain('untrusted data');
    expect(prompt).toContain('Do not search, infer, geocode, or invent');
    expect(prompt).toContain(request.source.url);
  });

  it('accepts only bounded pending proposal shapes', () => {
    expect(
      sourceProposalSchema.parse({
        candidates: [
          {
            name: 'Example Shop',
            kind: 'thrift',
            address: '',
            website: '',
            hours: '',
            description: '',
            evidenceNote: 'Name is visible in the supplied source text.',
            confidence: 'medium',
          },
        ],
      }).candidates,
    ).toHaveLength(1);
    expect(() =>
      sourceProposalSchema.parse({
        candidates: [
          {
            name: 'Invented place',
            kind: 'restaurant',
            address: '',
            hours: '',
            description: '',
            evidenceNote: 'none',
            confidence: 'high',
          },
        ],
      }),
    ).toThrow();
  });

  it('normalizes safe relative websites and clears malformed model URLs', () => {
    const baseCandidate = {
      name: 'Example Shop',
      kind: 'thrift',
      address: '',
      hours: '',
      description: '',
      evidenceNote: 'Name is visible in the supplied source text.',
      confidence: 'medium',
    } as const;
    expect(
      parseSourceProposal(
        { candidates: [{ ...baseCandidate, website: '/locations/example' }] },
        request.source.url,
      ).candidates[0].website,
    ).toBe('https://example.com/locations/example');
    expect(
      parseSourceProposal(
        { candidates: [{ ...baseCandidate, website: 'not a website' }] },
        request.source.url,
      ).candidates[0].website,
    ).toBe('');
  });

  it('fails closed when Gemini credentials are absent', async () => {
    await expect(generateWithGemini(request, '')).rejects.toThrow('GEMINI_API_KEY');
  });

  it('enforces per-run and persistent daily model-call limits', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'thrifty-model-budget-'));
    try {
      const first = new ModelBudget(directory, () => Date.parse('2026-11-02T12:00:00Z'), 2, 3);
      await first.reserve();
      await first.reserve();
      await expect(first.reserve()).rejects.toBeInstanceOf(ModelBudgetError);
      const second = new ModelBudget(directory, () => Date.parse('2026-11-02T13:00:00Z'), 2, 3);
      await second.reserve();
      await expect(second.reserve()).rejects.toThrow('Daily model limit');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('queues valid unpublished plans for all requested launch areas', async () => {
    const queue = JSON.parse(await readFile('research/model-city-queue.json', 'utf8'));
    expect(queue.cities.map((city: { id: string }) => city.id)).toEqual([
      'dallas-tx',
      'austin-tx',
      'san-antonio-tx',
      'portland-or',
      'seattle-wa',
      'kansas-city-mo',
      'phoenix-az',
      'albuquerque-nm',
    ]);
    for (const entry of queue.cities) {
      const draft = draftSchema.parse(JSON.parse(await readFile(entry.file, 'utf8')));
      expect(draft.city.id).toBe(entry.id);
      expect(draft.candidates).toEqual([]);
    }
  });
});
