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
} from '../src/lib/discovery';
import { initialState } from '../src/lib/seed';
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
    const service = new DiscoveryService(fetcher, () => now);
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
    installDiscovery(app, new DiscoveryService(fetcher));
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
      new DiscoveryService(vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))),
    );
    expect(
      (await request(successful).get('/api/places?lat=39.75&lng=-104.99')).body.places,
    ).toHaveLength(4);
  });
});
