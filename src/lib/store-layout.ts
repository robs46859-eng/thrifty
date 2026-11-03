import { z } from 'zod';

export const layoutSections = {
  Clothing: '👚',
  Kitchenwares: '🍽️',
  'Lawn & garden': '🌱',
  'Living room': '🛋️',
  Bedroom: '🛏️',
  Stationery: '✏️',
  Games: '🎲',
  Books: '📚',
  'Bathroom goods': '🛁',
  Artwork: '🎨',
  Pictures: '🖼️',
  Linens: '🧺',
  Appliances: '🔌',
  Shoes: '👟',
  Hats: '🧢',
  Glasses: '👓',
  'Locked display': '🔒',
  'Donation drop-off': '📦',
  Restroom: '🚻',
  Entrance: '⬇️',
  Exit: '⬆️',
  Parking: '🅿️',
  'Blocked or closed doorway': '🚧',
  Miscellaneous: '🏷️',
  'Home security': '🔔',
  Electronics: '📺',
  Cleaning: '🧽',
  Auto: '🚗',
} as const;

export const layoutColumns = 6;
export const layoutRows = 7;
export const layoutSize = layoutColumns * layoutRows;

export function gridAddress(cell: number) {
  return String.fromCharCode(65 + (cell % layoutColumns)) + (1 + Math.floor(cell / layoutColumns));
}

export function sectionSymbol(label: string) {
  return Object.hasOwn(layoutSections, label)
    ? layoutSections[label as keyof typeof layoutSections]
    : '📍';
}

export const layoutSchema = z
  .array(
    z
      .object({
        cell: z
          .number()
          .int()
          .min(0)
          .max(layoutSize - 1),
        label: z.string().trim().min(1).max(40),
      })
      .strict(),
  )
  .min(1)
  .max(layoutSize)
  .refine(
    (tiles) => new Set(tiles.map((tile) => tile.cell)).size === tiles.length,
    'Each floor tile can hold one section.',
  );
export type LayoutTiles = z.infer<typeof layoutSchema>;
