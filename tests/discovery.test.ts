import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { DiscoveryService, installDiscovery, normalizePlaces } from '../server/discovery';
import {
  DENVER,
  directionsUrl,
  distanceMiles,
  matchesPlace,
  samplePlaces,
  safeWebsite,
  marketSeason,
  placeFreshness,
  denverDate,
  discoveryResponseSchema,
} from '../src/lib/discovery';
import { initialState } from '../src/lib/seed';
import {
  denverPlaces,
  allPlaces,
  sameSharedPlace,
  catalogues,
  categoryCounts,
  catalogueSchema,
  denverCatalogue,
} from '../src/lib/catalogue';
import { parseImport } from '../src/lib/storage';
const data = {
  elements: [
    {
      type: 'node',
      id: 1,
      lat: 39.75,
      lon: -104.99,
      tags: {
        name: 'Real thrift',
        shop: 'charity',
        website: 'javascript:alert(1)',
        opening_hours: 'Mo-Fr 10:00-18:00',
      },
    },
    {
      type: 'way',
      id: 2,
      center: { lat: 39.76, lon: -105 },
      tags: { name: 'Public market', amenity: 'marketplace' },
    },
    { type: 'node', id: 3, lat: 39.74, lon: -105, tags: { name: 'Farm', shop: 'farm' } },
    {
      type: 'node',
      id: 4,
      lat: 39.74,
      lon: -105,
      tags: { name: 'Vintage', shop: 'antiques', website: 'https://example.com/' },
    },
    {
      type: 'node',
      id: 5,
      lat: 39.74,
      lon: -105,
      tags: { name: 'Unrelated', shop: 'supermarket' },
    },
    { type: 'node', id: 6, tags: { name: 'Missing coordinates', shop: 'charity' } },
    { type: 'node', id: 7, lat: 39.74, lon: -105, tags: { shop: 'charity' } },
  ],
};
describe('map discovery and trip safety', () => {
  it('normalizes OSM nodes and center geometry without inventing schedules or links', () => {
    const result = normalizePlaces(data);
    expect(result.map((p) => p.kind)).toEqual(['thrift', 'market', 'farm', 'vintage']);
    expect(result[0].website).toBe('');
    expect(result[1].hours).toBe('');
    expect(result[1].tags).toContain('Market dates unverified');
    expect(result[0].sourceUrl).toBe('https://www.openstreetmap.org/node/1');
    expect(() => normalizePlaces({ elements: [], remark: 'query timed out' })).toThrow();
  });
  it('filters by full query and category and calculates straight-line distances', () => {
    expect(matchesPlace(samplePlaces[0], 'found clothing', 'thrift')).toBe(true);
    expect(matchesPlace(samplePlaces[0], 'clothing', 'market')).toBe(false);
    expect(distanceMiles(DENVER, DENVER)).toBe(0);
    expect(distanceMiles(DENVER, { lat: DENVER.lat + 1, lng: DENVER.lng })).toBeCloseTo(69.09, 1);
  });
  it('builds directions only for real public stops and preserves user stop order', () => {
    expect(directionsUrl(samplePlaces)).toBe('');
    const places = normalizePlaces(data);
    const url = new URL(directionsUrl(places.slice(0, 3), DENVER));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('destination')).toBe(`${places[2].lat},${places[2].lng}`);
    expect(url.searchParams.get('waypoints')).toBe(
      `${places[0].lat},${places[0].lng}|${places[1].lat},${places[1].lng}`,
    );
    expect(safeWebsite('data:text/html,hello')).toBe('');
  });
  it('migrates old workspaces and includes discovery in backups', () => {
    const state = initialState();
    const old = { ...state } as Record<string, unknown>;
    delete old.discovery;
    expect(parseImport(JSON.stringify(old)).discovery).toEqual({
      saved: [],
      stops: [],
      sellers: [],
    });
    state.discovery.saved.push(samplePlaces[0]);
    expect(parseImport(JSON.stringify(state)).discovery.saved[0].name).toBe('Found & Loved');
  });
  it('coalesces and caches bounded directory calls with safe static upstream destinations', async () => {
    let now = 100000;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
    const service = new DiscoveryService(fetcher, () => now, []);
    const [a, b] = await Promise.all([service.nearby(DENVER), service.nearby(DENVER)]);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await service.nearby(DENVER);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://overpass.private.coffee/api/interpreter');
    expect(fetcher.mock.calls[0][1].body.get('data')).toContain('around:8000');
    expect(fetcher.mock.calls[0][1].body.get('data')).toContain('out center tags 200');
    await expect(service.nearby({ lat: 40, lng: -105 })).rejects.toThrow('busy');
    now += 900001;
    fetcher.mockResolvedValue(new Response(JSON.stringify(data)));
    await service.nearby(DENVER);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('validates public API centers and gives honest failures without synthetic place substitution', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('secret connection detail'));
    const app = express();
    installDiscovery(app, new DiscoveryService(fetcher, Date.now, []));
    for (const query of [
      '',
      '?lat=&lng=',
      '?lat=91&lng=0',
      '?lat=0&lng=181',
      '?lat=NaN&lng=0',
      '?lat=1&lat=2&lng=0',
    ])
      expect((await request(app).get(`/api/places${query}`)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    const failure = await request(app).get('/api/places?lat=39.75&lng=-104.99');
    expect(failure.status).toBe(503);
    expect(failure.body.error).toContain('unavailable');
    expect(failure.body.places).toBeUndefined();
    expect(failure.text).not.toContain('secret');
    const successful = express();
    installDiscovery(
      successful,
      new DiscoveryService(
        vi.fn().mockResolvedValue(new Response(JSON.stringify(data))),
        Date.now,
        [],
      ),
    );
    expect(
      (await request(successful).get('/api/places?lat=39.75&lng=-104.99')).body.places,
    ).toHaveLength(4);
  });
});

describe('published Boulder directory', () => {
  it('serves all three reviewed categories from the registry without a paid or upstream lookup', async () => {
    const upstream = vi.fn().mockRejectedValue(new Error('upstream must not be used'));
    const app = express();
    installDiscovery(app, new DiscoveryService(upstream));
    const response = await request(app).get('/api/places?lat=40.015&lng=-105.2705');
    expect(response.status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
    expect(response.body.cityIds).toEqual(['boulder-co']);
    expect(response.body.categoryCounts).toMatchObject({ thrift: 3, market: 3, vintage: 3 });
    expect(response.body.places).toHaveLength(9);
    expect(
      response.body.places.every((p: { id: string }) => p.id.startsWith('official:boulder-co:')),
    ).toBe(true);
    const boulder = catalogues.find((c) => c.cityProfile.id === 'boulder-co')!;
    const market = boulder.places.find((p) => p.id.endsWith(':lafayette-farmers-market'))!;
    expect(marketSeason(market, new Date('2026-11-01T18:00:00Z'))).toContain('ended');
    expect(boulder.places.some((p) => /Garage Sale/.test(p.name))).toBe(false);
    expect(boulder.places.find((p) => p.id.endsWith(':little-horse-louisville'))?.hours).toBe('');
  });
});

describe('adjacent city directories', () => {
  it('keeps shared venue IDs unique and selects the requested city without mixing catalogues', async () => {
    const upstream = vi.fn().mockRejectedValue(new Error('must stay local'));
    const app = express();
    installDiscovery(app, new DiscoveryService(upstream));
    for (const [id, lat, lng] of [
      ['englewood-co', 39.6478, -104.9878],
      ['littleton-co', 39.6133, -105.0166],
    ] as const) {
      const result = await request(app).get(`/api/places?lat=${lat}&lng=${lng}`);
      expect(result.status).toBe(200);
      expect(result.body.cityIds).toEqual([id]);
      expect(result.body.places).toHaveLength(9);
      expect(result.body.categoryCounts).toMatchObject({ thrift: 3, market: 3, vintage: 3 });
    }
    expect(upstream).not.toHaveBeenCalled();
    expect(allPlaces.filter((p) => p.id === 'official:boss-vintage')).toHaveLength(1);
    expect(new Set(allPlaces.map((p) => p.id)).size).toBe(allPlaces.length);
    const boss = denverPlaces.find((p) => p.id === 'official:boss-vintage')!;
    expect(sameSharedPlace(boss, { ...boss, timezone: 'America/Denver' })).toBe(true);
    expect(sameSharedPlace(boss, { ...boss, address: 'Unreviewed replacement' })).toBe(false);
  });
});

describe('real Denver directory', () => {
  it('serves three populated categories without a third-party call or fictional entries', async () => {
    const upstream = vi.fn().mockRejectedValue(new Error('public service down'));
    const app = express();
    installDiscovery(app, new DiscoveryService(upstream, Date.now, denverPlaces));
    const response = await request(app).get('/api/places?lat=39.75&lng=-104.99');
    expect(response.status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
    expect(response.body.categoryCounts).toMatchObject({ thrift: 10, market: 4, vintage: 3 });
    expect(response.body.places).toHaveLength(17);
    expect(response.body.places.every((p: { source: string }) => p.source === 'official')).toBe(
      true,
    );
    expect(response.body.reviewedAt).toBe('2026-11-01');
    expect(response.body.source).toBe('Denver source directory');
  });
  it('requires evidence, unique IDs and consistent seasons in the maintained data', () => {
    expect(categoryCounts(denverPlaces)).toMatchObject({ thrift: 10, market: 4, vintage: 3 });
    expect(
      catalogueSchema.safeParse({ ...denverCatalogue, places: [...denverPlaces, denverPlaces[0]] })
        .success,
    ).toBe(false);
    expect(
      catalogueSchema.safeParse({
        ...denverCatalogue,
        places: denverPlaces.map((p) => ({ ...p, sourceUrl: 'javascript:bad' })),
      }).success,
    ).toBe(false);
    const backup = initialState();
    backup.discovery.saved = [denverPlaces[0]];
    expect(parseImport(JSON.stringify(backup)).discovery.saved[0].checkedAt).toBe('2026-11-01');
  });
  it('distinguishes expired, current and future market seasons using Denver calendar dates', () => {
    const now = new Date('2026-11-01T18:00:00Z');
    const get = (id: string) => denverPlaces.find((p) => p.id === `official:${id}`)!;
    expect(marketSeason(get('city-park-market'), now)).toBe('2026 season ended');
    expect(marketSeason(get('south-pearl-market'), now)).toContain('Within listed 2026 season');
    expect(marketSeason(get('cherry-creek-market'), now)).toBe('Season starts 2027-05-01');
    expect(marketSeason(get('city-park-market'), new Date('2026-11-01T05:30:00Z'))).toContain(
      'Within listed',
    );
    expect(denverDate(new Date('2026-11-01T05:30:00Z'))).toBe('2026-10-31');
    expect(placeFreshness(get('city-park-market'), new Date('2026-12-03T18:00:00Z'))).toContain(
      'Review overdue',
    );
  });
  it('routes official addresses and mixed public sources without routing sample destinations', () => {
    const official = denverPlaces[0],
      osm = normalizePlaces(data)[0];
    const route = new URL(directionsUrl([osm, official]));
    expect(route.searchParams.get('destination')).toContain(official.address);
    expect(route.searchParams.get('waypoints')).toBe(`${osm.lat},${osm.lng}`);
    expect(directionsUrl(samplePlaces)).toBe('');
  });
});

it('caps overlapping city discoveries at 200 nearest records without an upstream request', async () => {
  const upstream = vi.fn();
  const places = Array.from({ length: 250 }, (_, i) => ({
    ...denverPlaces[0],
    id: `official:fixture-${i}`,
    lat: 39.75 + (249 - i) * 0.00001,
    lng: -104.99,
  }));
  const service = new DiscoveryService(upstream, Date.now, places);
  const result = discoveryResponseSchema.parse(await service.nearby({ lat: 39.75, lng: -104.99 }));
  expect(result.places.length).toBe(200);
  expect(result.places[0].id).toBe('official:fixture-249');
  expect(upstream).not.toHaveBeenCalled();
});
