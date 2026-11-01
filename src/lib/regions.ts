import { z } from 'zod';
import { pointSchema } from './discovery-point';
export const usStates = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;
export const usTimezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Adak',
  'Pacific/Honolulu',
  'America/Detroit',
  'America/Indiana/Indianapolis',
  'America/Kentucky/Louisville',
  'America/Boise',
] as const;
export const usTimezoneSchema = z.enum(usTimezones);
export function inUSPlanningBounds(point: { lat: number; lng: number }, state: string) {
  if (state === 'AK')
    return point.lat >= 51 && point.lat <= 72 && (point.lng <= -129 || point.lng >= 172);
  if (state === 'HI')
    return point.lat >= 18.8 && point.lat <= 22.6 && point.lng >= -161 && point.lng <= -154;
  return point.lat >= 24 && point.lat <= 50 && point.lng >= -125 && point.lng <= -66;
}
export const cityProfileSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[a-z]{2}$/)
      .max(80),
    city: z.string().trim().min(1).max(80),
    state: z.enum(usStates),
    country: z.literal('US'),
    timezone: usTimezoneSchema,
    center: pointSchema,
    radiusKm: z.number().min(5).max(50).default(20),
  })
  .refine(
    (c) => c.id.endsWith(`-${c.state.toLowerCase()}`),
    'City ID must end in its US state code',
  )
  .refine(
    (c) => inUSPlanningBounds(c.center, c.state),
    'City center is outside supported US planning bounds',
  );
export type CityProfile = z.infer<typeof cityProfileSchema>;
