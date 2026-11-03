import { z } from 'zod';
import { publicSourceUrl } from './city-workflow';
import { usStates } from '../../src/lib/regions';
const url = z.string().url().transform(publicSourceUrl);
export const publicationBatchSchema = z
  .object({
    reviewedAt: z.iso.date(),
    seeds: z
      .array(
        z.object({
          cityId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z]{2}$/),
          slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          name: z.string().min(1).max(160),
          kind: z.enum(['thrift', 'market', 'vintage']),
          address: z.string().min(10).max(240),
          city: z.string().min(1),
          state: z.enum(usStates),
          zip: z.string().regex(/^(\d{5})?$/),
          approvedMatchedAddress: z.string().optional(),
          sourceUrl: url,
          sourceLabel: z.string().min(1).max(120),
          description: z.string().min(1).max(1200),
          tags: z.array(z.string()).max(12),
          fixedPoint: z
            .object({
              lat: z.number().min(24).max(72),
              lng: z.number().min(-180).max(-66),
              sourceUrl: url,
            })
            .optional(),
        }),
      )
      .min(1)
      .max(150),
  })
  .superRefine((batch, ctx) => {
    const ids = new Set<string>(),
      addresses = new Set<string>();
    for (const seed of batch.seeds) {
      const id = `${seed.cityId}:${seed.slug}`;
      const address = seed.address.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ids.has(id) || addresses.has(address))
        ctx.addIssue({ code: 'custom', message: `Duplicate venue: ${seed.name}` });
      ids.add(id);
      addresses.add(address);
      if (!seed.cityId.endsWith(`-${seed.state.toLowerCase()}`))
        ctx.addIssue({ code: 'custom', message: 'State mismatch' });
      if (/corporate office|order pickup|donation.only/i.test(seed.name))
        ctx.addIssue({ code: 'custom', message: `Non-retail candidate: ${seed.name}` });
    }
  });
