import { z } from 'zod';
import { catalogueSnapshots } from '../generated/catalogues';
import { placeSchema, distanceMiles, safeWebsite, type Point } from './discovery';
import { cityProfileSchema, inUSPlanningBounds } from './regions';
export const catalogueSchema = z
  .object({
    version: z.literal(1),
    region: z.string().trim().min(1).max(120),
    cityProfile: cityProfileSchema,
    reviewedAt: z.iso.date(),
    reviewIntervalDays: z.literal(30),
    places: z
      .array(
        placeSchema.refine(
          (p) =>
            p.source === 'official' &&
            !!p.checkedAt &&
            !!p.sourceLabel &&
            !!p.address.trim() &&
            safeWebsite(p.sourceUrl).startsWith('https://') &&
            !!p.coordinateNote,
          'Official listings need an address, source, review date and coordinate provenance',
        ),
      )
      .min(3)
      .max(200),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.places.map((p) => p.id)).size !== c.places.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate directory IDs' });
    for (const p of c.places) {
      if (!inUSPlanningBounds(p, c.cityProfile.state))
        ctx.addIssue({
          code: 'custom',
          message: `${p.id}: coordinates outside US planning bounds`,
        });
      if (distanceMiles(c.cityProfile.center, p) > c.cityProfile.radiusKm / 1.609344)
        ctx.addIssue({ code: 'custom', message: `${p.id}: beyond city coverage radius` });
      if (p.season && p.season.timezone !== c.cityProfile.timezone)
        ctx.addIssue({ code: 'custom', message: `${p.id}: market timezone differs from city` });
    }
  });
export type Catalogue = z.infer<typeof catalogueSchema>;
export const catalogues = catalogueSnapshots.map((c) => catalogueSchema.parse(c));
if (new Set(catalogues.map((c) => c.cityProfile.id)).size !== catalogues.length)
  throw new Error('Duplicate published city IDs');
export function sameSharedPlace(a: unknown, b: unknown) {
  const { timezone: aZone, ...first } = placeSchema.parse(a);
  const { timezone: bZone, ...second } = placeSchema.parse(b);
  return JSON.stringify(first) === JSON.stringify(second) && (!aZone || !bZone || aZone === bZone);
}
const uniquePlaces = new Map<string, (typeof catalogues)[number]['places'][number]>();
for (const city of catalogues)
  for (const place of city.places) {
    const previous = uniquePlaces.get(place.id);
    if (previous && !sameSharedPlace(previous, place))
      throw new Error(`Conflicting shared place: ${place.id}`);
    if (!previous) uniquePlaces.set(place.id, place);
  }
export const allPlaces = [...uniquePlaces.values()];
export function catalogueForPoint(point: Point) {
  return catalogues
    .filter((c) => distanceMiles(c.cityProfile.center, point) <= c.cityProfile.radiusKm / 1.609344)
    .sort(
      (a, b) =>
        distanceMiles(a.cityProfile.center, point) - distanceMiles(b.cityProfile.center, point),
    )[0];
}
export const denverCatalogue = catalogues.find((c) => c.cityProfile.id === 'denver-co')!;
export const denverPlaces = denverCatalogue.places;
export const DIRECTORY_RADIUS_MILES = 12.43;
export const categoryCounts = (places = allPlaces) =>
  Object.fromEntries(
    ['thrift', 'market', 'vintage', 'farm', 'seller'].map((kind) => [
      kind,
      places.filter((p) => p.kind === kind).length,
    ]),
  );
export function catalogueNear(point: Point) {
  return allPlaces.filter((p) => distanceMiles(point, p) <= DIRECTORY_RADIUS_MILES);
}
export function regionsForPlaces(places: typeof allPlaces) {
  const ids = new Set(places.map((p) => p.id));
  return catalogues.filter((c) => c.places.some((p) => ids.has(p.id)));
}
