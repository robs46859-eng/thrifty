import { describe, it, expect } from 'vitest';
import { publicationBatchSchema } from '../scripts/lib/publication-batch';
import batch from '../research/publication-batch.json';
describe('approved publication batch', () => {
  it('accepts the reviewed eight-city batch', () =>
    expect(publicationBatchSchema.parse(batch).seeds).toHaveLength(72));
  it('rejects duplicated venues and corporate offices', () => {
    expect(
      publicationBatchSchema.safeParse({ ...batch, seeds: [batch.seeds[0], batch.seeds[0]] })
        .success,
    ).toBe(false);
    expect(
      publicationBatchSchema.safeParse({
        ...batch,
        seeds: [{ ...batch.seeds[0], name: 'Goodwill Corporate Office' }],
      }).success,
    ).toBe(false);
  });
  it('rejects state mismatch, path traversal and credential URLs', () => {
    for (const override of [
      { state: 'WA' },
      { cityId: '../../secrets' },
      { sourceUrl: 'https://example.com/?key=private' },
    ]) {
      expect(() =>
        publicationBatchSchema.parse({ ...batch, seeds: [{ ...batch.seeds[0], ...override }] }),
      ).toThrow();
    }
  });
});
