import { z } from 'zod';
import settings from '../../research/limits.json';

export const researchLimitsSchema = z
  .object({
    webSearchesPerPass: z.number().int().min(1).max(50),
    sourcePagesPerPass: z.number().int().min(1).max(100),
    requestsPerCommand: z.number().int().min(1).max(100),
    requestsPerUTCDay: z.number().int().min(1).max(500),
    sourceCacheDays: z.number().int().min(1).max(30),
    geocodeCacheDays: z.number().int().min(1).max(365),
  })
  .strict()
  .refine((v) => v.requestsPerCommand <= v.requestsPerUTCDay, {
    message: 'The per-command budget cannot exceed the daily budget',
  });

export const researchLimits = researchLimitsSchema.parse(settings);
