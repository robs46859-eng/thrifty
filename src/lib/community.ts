import { z } from 'zod';
import { layoutSchema } from './store-layout';
export const reportKinds = [
  'restock',
  'discount',
  'closure',
  'holiday_hours',
  'prices',
  'layout',
  'rating',
  'parking',
  'find',
  'accessibility',
] as const;
export type ReportKind = (typeof reportKinds)[number];
export const reportLabels: Record<ReportKind, string> = {
  restock: 'Restock days',
  discount: 'Discount days',
  closure: 'Unlisted closure / reopening',
  holiday_hours: 'Holiday hours',
  prices: 'Category price ranges',
  layout: 'Store layout',
  rating: 'Store rating',
  parking: 'Parking',
  find: 'Nearby find',
  accessibility: 'Accessibility',
};
export const shoppingCategories = [
  'Clothing',
  'Home',
  'Furniture',
  'Electronics',
  'Collectibles',
  'Pet gear',
  'Books',
  'Produce',
  'Food & drink',
  'Other',
] as const;
export const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const amount = z.number().finite().min(0).max(1000000);
export const reportInputSchema = z
  .object({
    placeId: z.string().min(1).max(150),
    kind: z.enum(reportKinds),
    details: z.string().trim().min(3).max(600),
    observedOn: z.iso.date(),
    weekdays: z.array(z.enum(weekdays)).max(7).default([]),
    appliesOn: z.iso.date().optional(),
    timeWindow: z.string().trim().max(100).optional(),
    category: z.enum(shoppingCategories).optional(),
    priceMin: amount.optional(),
    priceMax: amount.optional(),
    rating: z.number().int().min(1).max(5).optional(),
    closureStatus: z.enum(['temporarily_closed', 'permanently_closed', 'reopened']).optional(),
    itemName: z.string().trim().min(1).max(120).optional(),
    layout: layoutSchema.optional(),
    area: z.string().trim().max(100).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (r.layout && r.kind !== 'layout') issue('Floor plans belong in store layout reports.');
    if (r.appliesOn && !['restock', 'discount', 'closure', 'holiday_hours'].includes(r.kind))
      issue('Specific dates belong in schedule or closure updates.');
    if (r.priceMin !== undefined || r.priceMax !== undefined) {
      if (!['prices', 'find'].includes(r.kind)) issue('Prices belong in category prices or finds.');
    }
    if (r.closureStatus && r.kind !== 'closure')
      issue('Closure status belongs in closure updates.');
    if (r.itemName && r.kind !== 'find') issue('Find names belong in nearby finds.');

    if (['restock', 'discount'].includes(r.kind) && !r.weekdays.length && !r.appliesOn)
      issue('Choose a weekday or a specific date.');
    if (new Set(r.weekdays).size !== r.weekdays.length) issue('Choose each weekday only once.');
    if (r.kind === 'holiday_hours' && (!r.appliesOn || !r.timeWindow))
      issue('Holiday updates need a date and hours, or “Closed”.');
    if (r.kind === 'closure' && !r.closureStatus) issue('Choose closed or reopened.');
    if (
      r.kind === 'prices' &&
      (!r.category || r.priceMin === undefined || r.priceMax === undefined)
    )
      issue('Price ranges need a category and both prices.');
    if (r.priceMin !== undefined && r.priceMax !== undefined && r.priceMin > r.priceMax)
      issue('The lower price cannot exceed the upper price.');
    if (r.kind === 'rating' && !r.rating) issue('Choose a rating from one to five.');
    if (r.kind === 'find' && !r.itemName) issue('Give your find a name.');
    if (r.rating !== undefined && r.kind !== 'rating')
      issue('Ratings belong in store rating updates.');
  });
export type ReportInput = z.infer<typeof reportInputSchema>;
export const reportSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  kind: z.enum(reportKinds),
  details: z.string(),
  observedOn: z.iso.date(),
  weekdays: z.array(z.enum(weekdays)),
  appliesOn: z.iso.date().optional(),
  timeWindow: z.string().optional(),
  category: z.enum(shoppingCategories).optional(),
  priceMin: amount.optional(),
  priceMax: amount.optional(),
  rating: z.number().optional(),
  closureStatus: z.string().optional(),
  itemName: z.string().optional(),
  area: z.string().optional(),
  layout: layoutSchema.optional(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  authorLabel: z.string(),
  confirmations: z.number().int().min(0),
  disputes: z.number().int().min(0),
  flags: z.number().int().min(0),
  myVote: z.enum(['confirm', 'dispute']).nullable(),
  myFlag: z.boolean(),
  isMine: z.boolean(),
  hidden: z.boolean(),
  expired: z.boolean(),
});
export type CommunityReport = z.infer<typeof reportSchema>;
export const summarySchema = z.object({
  count: z.number().int().min(0),
  averageRating: z.number().nullable(),
  ratingCount: z.number().int().min(0),
  signals: z.array(z.enum(reportKinds)),
  lastReportedAt: z.iso.datetime().nullable(),
});
export type CommunitySummary = z.infer<typeof summarySchema>;
export const summariesSchema = z.record(z.string(), summarySchema);
export const reportsResponseSchema = z.object({
  reports: z.array(reportSchema).max(100),
  summary: summarySchema,
});
export const emptySummary: CommunitySummary = {
  count: 0,
  averageRating: null,
  ratingCount: 0,
  signals: [],
  lastReportedAt: null,
};
export const reportTTLDays: Record<ReportKind, number> = {
  restock: 45,
  discount: 14,
  closure: 3,
  holiday_hours: 30,
  prices: 30,
  layout: 90,
  rating: 180,
  parking: 30,
  find: 2,
  accessibility: 60,
};
export function reportFacts(
  r: Pick<
    CommunityReport,
    | 'kind'
    | 'weekdays'
    | 'appliesOn'
    | 'timeWindow'
    | 'category'
    | 'priceMin'
    | 'priceMax'
    | 'rating'
    | 'closureStatus'
    | 'itemName'
    | 'area'
  >,
) {
  const price =
    r.priceMin === undefined
      ? ''
      : r.priceMax !== undefined && r.priceMax !== r.priceMin
        ? `$${r.priceMin}–$${r.priceMax}`
        : `$${r.priceMin}`;
  return [
    r.itemName,
    r.rating ? `${r.rating}/5 stars` : '',
    r.closureStatus?.replaceAll('_', ' '),
    r.category,
    price,
    r.weekdays.join(', '),
    r.appliesOn ? `Applies ${r.appliesOn}` : '',
    r.timeWindow,
    r.area,
  ]
    .filter(Boolean)
    .join(' · ');
}
