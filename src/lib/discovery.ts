import { z } from 'zod';
import { pointSchema } from './discovery-point';
import { usTimezoneSchema } from './regions';
export { pointSchema };
export type Point = z.infer<typeof pointSchema>;
export const placeKinds = ['thrift', 'market', 'vintage', 'farm', 'seller'] as const;
export type PlaceKind = (typeof placeKinds)[number];
export const kindLabels: Record<PlaceKind, string> = {
  thrift: 'Thrift store',
  market: 'Farmers & public market',
  vintage: 'Vintage & antiques',
  farm: 'Farm shop',
  seller: 'Local seller',
};
export const placeSchema = pointSchema.extend({
  id: z.string().min(1).max(150),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(placeKinds),
  address: z.string().max(300),
  description: z.string().max(1200),
  hours: z.string().max(200),
  website: z.string().max(500),
  source: z.enum(['osm', 'official', 'sample', 'draft']),
  sourceLabel: z.string().max(120).optional(),
  checkedAt: z.iso.date().optional(),
  timezone: usTimezoneSchema.optional(),
  coordinateNote: z.string().max(250).optional(),
  coordinateSourceUrl: z.string().max(500).optional(),
  additionalSourceUrls: z.array(z.string().max(500)).max(5).optional(),
  phone: z.string().max(40).optional(),
  season: z
    .object({ startsOn: z.iso.date(), endsOn: z.iso.date(), timezone: usTimezoneSchema })
    .refine((value) => value.startsOn <= value.endsOn, 'Season dates are out of order')
    .optional(),
  sourceUrl: z.string().max(500),
  tags: z.array(z.string().max(60)).max(12),
});
export type Place = z.infer<typeof placeSchema>;
export const discoverySchema = z
  .object({
    saved: z.array(placeSchema).max(200).default([]),
    stops: z.array(placeSchema).max(8).default([]),
    sellers: z.array(placeSchema).max(50).default([]),
  })
  .default({ saved: [], stops: [], sellers: [] });
export const DENVER: Point = { lat: 39.753, lng: -104.99 };
export const discoveryResponseSchema = z.object({
  places: z.array(placeSchema).max(200),
  fetchedAt: z.string(),
  source: z.enum(['OpenStreetMap', 'Denver source directory', 'Reviewed US directory']),
  region: z.string().max(200).optional(),
  cityIds: z.array(z.string()).max(100).optional(),
  reviewedAt: z.iso.date().optional(),
  coverage: z.string().max(300).optional(),
});
export function safeWebsite(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
export function distanceMiles(a: Point, b: Point) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function matchesPlace(place: Place, query: string, kind: string) {
  const text = [place.name, place.address, place.description, ...place.tags]
    .join(' ')
    .toLowerCase();
  return (
    (kind === 'all' || place.kind === kind) &&
    query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((word) => text.includes(word))
  );
}
export function directionsUrl(stops: Place[], origin?: Point) {
  // Samples and unpublished drafts must never become real-world destinations.
  const actual = stops.filter(isPublicPlace).slice(0, 8);
  if (!actual.length) return '';
  const coord = (p: Point) => `${p.lat},${p.lng}`;
  const destination = (p: Place) =>
    p.source === 'official' ? `${p.name}, ${p.address}` : coord(p);
  const params = new URLSearchParams({
    api: '1',
    destination: destination(actual[actual.length - 1]),
    travelmode: 'driving',
  });
  if (origin) params.set('origin', coord(origin));
  if (actual.length > 1) params.set('waypoints', actual.slice(0, -1).map(destination).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
const sample = (
  id: string,
  name: string,
  kind: PlaceKind,
  lat: number,
  lng: number,
  tags: string[],
  description: string,
): Place => ({
  id: `sample:${id}`,
  name,
  kind,
  lat,
  lng,
  tags,
  description,
  address: 'Illustrative Denver location · not a real business',
  hours: 'Illustrative listing · no verified opening hours',
  website: '',
  source: 'sample',
  sourceUrl: '',
});
export const samplePlaces: Place[] = [
  sample(
    'found',
    'Found & Loved',
    'thrift',
    39.7586,
    -105.0081,
    ['Clothing', 'Homewares'],
    'A little of everything, with plenty of second stories. Browse an example thrift shop.',
  ),
  sample(
    'weekend',
    'The Weekend Market',
    'market',
    39.7537,
    -104.9963,
    ['Produce', 'Flowers', 'Local makers'],
    'A sample gathering of growers, bakers, flower stalls, and independent makers.',
  ),
  sample(
    'rewind',
    'Rewind Vintage',
    'vintage',
    39.7628,
    -104.9835,
    ['Vintage clothing', 'Accessories'],
    'Explore a sample vintage shop full of pre-loved pieces and unexpected finds.',
  ),
  sample(
    'harvest',
    'Little Harvest Farm Stand',
    'farm',
    39.7465,
    -105.0105,
    ['Seasonal produce', 'Plants'],
    'An illustrative neighborhood farm stand. Seasonal produce and plants from local growers.',
  ),
  sample(
    'second',
    'Second Story Goods',
    'thrift',
    39.7429,
    -104.9804,
    ['Furniture', 'Homewares'],
    'A sample shop for furniture, homewares, and making a space your own.',
  ),
  sample(
    'studio',
    'Margo’s Market Stall',
    'seller',
    39.755,
    -104.9786,
    ['Handmade', 'Ceramics'],
    'A fictional independent seller. Preview how a maker or market stall appears on the map.',
  ),
  sample(
    'sunday',
    'Sunday on the Green',
    'market',
    39.7684,
    -105.0039,
    ['Baked goods', 'Produce'],
    'A sample open-air market with neighborhood food stalls. This is not a scheduled event.',
  ),
  sample(
    'attic',
    'The Attic Collective',
    'vintage',
    39.7394,
    -104.9965,
    ['Antiques', 'Collectibles'],
    'An illustrative antique and collectibles destination.',
  ),
];

export function isPublicPlace(place: Place) {
  return place.source === 'osm' || place.source === 'official';
}
export function localDate(now = new Date(), timezone = 'America/Denver') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function placeFreshness(place: Place, now = new Date()) {
  if (!place.checkedAt) return 'Source date not listed';
  const age =
    (Date.parse(localDate(now, place.timezone ?? place.season?.timezone)) -
      Date.parse(place.checkedAt)) /
    86400000;
  return age > 30
    ? `Review overdue · checked ${place.checkedAt}`
    : `Source checked ${place.checkedAt}`;
}
export function marketSeason(place: Place, now = new Date()) {
  if (!place.season) return '';
  const day = localDate(now, place.season.timezone);
  if (day > place.season.endsOn) return `${place.season.endsOn.slice(0, 4)} season ended`;
  if (day < place.season.startsOn) return `Season starts ${place.season.startsOn}`;
  return `Within listed ${place.season.startsOn.slice(0, 4)} season · confirm dates`;
}

// Backward-compatible helper for the original Denver directory.
export const denverDate = (now = new Date()) => localDate(now, 'America/Denver');
