import { z } from 'zod';
import snapshot from '../../data/denver-places.json';
import { placeSchema, distanceMiles, safeWebsite, type Point } from './discovery';
export const catalogueSchema = z
  .object({
    version: z.literal(1),
    region: z.literal('Denver metro'),
    reviewedAt: z.iso.date(),
    reviewIntervalDays: z.literal(30),
    places: z
      .array(
        placeSchema.refine(
          (p) =>
            p.source === 'official' &&
            !!p.checkedAt &&
            !!p.sourceLabel &&
            safeWebsite(p.sourceUrl).startsWith('https://') &&
            !!p.coordinateNote,
          'Official listings need source, review date and coordinate provenance',
        ),
      )
      .min(3)
      .max(200),
  })
  .refine(
    (c) => new Set(c.places.map((p) => p.id)).size === c.places.length,
    'Duplicate directory IDs',
  );
export const denverCatalogue = catalogueSchema.parse(snapshot);
export const denverPlaces = denverCatalogue.places;
export const DIRECTORY_RADIUS_MILES = 12.43; // 20 km; covers the launch metro listings.
export function catalogueNear(point: Point) {
  return denverPlaces.filter((p) => distanceMiles(point, p) <= DIRECTORY_RADIUS_MILES);
}
export const categoryCounts = (places = denverPlaces) =>
  Object.fromEntries(
    ['thrift', 'market', 'vintage', 'farm', 'seller'].map((kind) => [
      kind,
      places.filter((p) => p.kind === kind).length,
    ]),
  );
