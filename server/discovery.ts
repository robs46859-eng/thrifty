import type { Express } from 'express';
import { z } from 'zod';
import { pointSchema, safeWebsite, type Place, type Point } from '../src/lib/discovery';
const osmElement = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).default({}),
});
export function normalizePlaces(raw: unknown): Place[] {
  const response = z
    .object({ elements: z.array(z.unknown()).max(5000), remark: z.string().optional() })
    .parse(raw);
  if (response.remark) throw new Error('Incomplete directory response');
  const places: Place[] = [];
  for (const row of response.elements) {
    const parsed = osmElement.safeParse(row);
    if (!parsed.success) continue;
    const { tags: t, type, id, center, lat, lon } = parsed.data;
    const point = pointSchema.safeParse({ lat: lat ?? center?.lat, lng: lon ?? center?.lon });
    if (!point.success || !t.name?.trim()) continue;
    let kind: Place['kind'];
    if (t.amenity === 'marketplace') kind = 'market';
    else if (t.shop === 'farm') kind = 'farm';
    else if (['antiques', 'vintage'].includes(t.shop)) kind = 'vintage';
    else if (['second_hand', 'charity'].includes(t.shop) || ['yes', 'only'].includes(t.second_hand))
      kind = 'thrift';
    else continue;
    places.push({
      ...point.data,
      id: `osm:${type}:${id}`,
      name: t.name.slice(0, 160),
      kind,
      address:
        [t['addr:housenumber'], t['addr:street'], t['addr:city']]
          .filter(Boolean)
          .join(' ')
          .slice(0, 300) || 'Address not listed · check map position',
      description: (
        t.description ||
        (kind === 'market'
          ? 'A community-mapped public market. Check its official page for farmers market dates and vendors.'
          : 'A community-mapped local destination. Check the listing before you travel.')
      ).slice(0, 1200),
      hours: (t.opening_hours || '').slice(0, 200),
      website: safeWebsite(t.website || t['contact:website'] || '').slice(0, 500),
      source: 'osm',
      sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
      tags: [
        t.organic === 'yes' ? 'Organic' : '',
        t.wheelchair === 'yes' ? 'Wheelchair access mapped' : '',
        t.shop === 'charity' ? 'Charity shop' : '',
        kind === 'market' ? 'Market dates unverified' : '',
      ].filter(Boolean),
    });
  }
  return [...new Map(places.map((p) => [p.id, p])).values()].slice(0, 200);
}
export class DiscoveryService {
  private cache = new Map<string, { until: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  private nextFetch = 0;
  constructor(
    private fetcher: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  async nearby(point: Point) {
    // Quantized center, bounded 8 km search, one upstream request at a time, 15 min cache.
    const lat = Math.round(point.lat * 100) / 100,
      lng = Math.round(point.lng * 100) / 100;
    const key = `${lat},${lng}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return cached.value;
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size || this.now() < this.nextFetch)
      throw new Error('Directory is busy. Try again in a few seconds.');
    this.nextFetch = this.now() + 5000;
    const promise = (async () => {
      const scope = `(around:8000,${lat},${lng})`;
      const query = `[out:json][timeout:18];(nwr["shop"~"^(second_hand|charity|antiques|vintage|farm)$"]${scope};nwr["second_hand"~"^(yes|only)$"]${scope};nwr["amenity"="marketplace"]${scope};);out center tags 200;`;
      const response = await this.fetcher('https://overpass.private.coffee/api/interpreter', {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Thrifty/0.2 (https://worklifelm.com; nearby place discovery)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(22000),
      });
      if (!response.ok) throw new Error('The public place directory is temporarily unavailable.');
      const value = {
        places: normalizePlaces(await response.json()),
        fetchedAt: new Date(this.now()).toISOString(),
        source: 'OpenStreetMap',
      };
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { until: this.now() + 15 * 60 * 1000, value });
      return value;
    })();
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }
}
export function installDiscovery(app: Express, service = new DiscoveryService()) {
  app.get('/api/places', async (req, res) => {
    const parsed = pointSchema.safeParse({
      lat: Number(req.query.lat ?? NaN),
      lng: Number(req.query.lng ?? NaN),
    });
    if (
      !parsed.success ||
      typeof req.query.lat !== 'string' ||
      typeof req.query.lng !== 'string' ||
      !req.query.lat.trim() ||
      !req.query.lng.trim()
    ) {
      res.status(400).json({ error: 'Choose a valid map center.' });
      return;
    }
    try {
      res.json(await service.nearby(parsed.data));
    } catch {
      res.set('Retry-After', '10').status(503).json({
        error:
          'The public directory is unavailable or busy. Try again shortly, or explore the clearly marked sample map.',
      });
    }
  });
}
