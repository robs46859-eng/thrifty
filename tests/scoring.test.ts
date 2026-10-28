import { describe, expect, it } from 'vitest';
import { initialState, examples, sampleComps } from '../src/lib/seed';
import { householdScore, matchingComps, merchantScore, pricing } from '../src/lib/scoring';
import { channelSuggestion, disconnectedAdapter } from '../src/lib/marketplaces';
import { candidateSchema, itemKey, type InventoryItem, type Sale } from '../src/lib/model';
const now = new Date('2026-10-28T12:00:00Z');
const item = { ...examples.fleece };
const state = initialState();
const comps = sampleComps('fleece', '2026-10-20');
describe('evidence-based pricing', () => {
  it('uses sold prices only and subtracts every entered cost and fee', () => {
    const result = pricing(item, comps, state.merchant, now)!;
    expect(result.median).toBe(48);
    expect(result.low).toBe(42);
    expect(result.high).toBe(54);
    expect(result.profit).toBeCloseTo(48 * 0.87 - 0.3 - 6 - 2 - 12 - 2);
    expect(result.confidence).toBe('Illustrative');
  });
  it('does not estimate unknown items, wrong condition, stale/future sales, zero prices or asking-only data', () => {
    expect(pricing({ ...item, title: 'Different model' }, comps, state.merchant, now)).toBeNull();
    expect(matchingComps({ ...item, condition: 'Poor' }, comps, now)).toHaveLength(0);
    const unusable = [
      { ...comps[0], date: '2025-10-20' },
      { ...comps[0], date: '2027-01-01' },
      { ...comps[0], price: 0 },
      { ...comps[0], kind: 'asking' as const },
    ];
    expect(pricing(item, unusable, state.merchant, now)).toBeNull();
  });
  it('calculates the median for even-sized samples and exposes negative profit', () => {
    expect(pricing(item, comps.slice(0, 2), state.merchant, now)?.median).toBe(45);
    expect(pricing({ ...item, cost: 500 }, comps, state.merchant, now)!.profit).toBeLessThan(0);
  });
  it('keeps scores bounded and refuses a resale score without evidence', () => {
    expect(merchantScore(item, [], state.merchant, [], now).score).toBeNull();
    expect(
      merchantScore({ ...item, cost: 500 }, comps, state.merchant, [], now).score,
    ).toBeLessThan(50);
    const score = merchantScore(item, comps, state.merchant, [], now).score!;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
  it('considers only real history in the same category and source store', () => {
    const sale: Sale = {
      id: 's1',
      itemId: 'i1',
      title: 'Fleece',
      category: 'Clothing',
      store: item.store,
      cost: 12,
      soldFor: 50,
      expenses: 10,
      date: '2026-10-20',
      demo: false,
    };
    const result = merchantScore(
      item,
      comps,
      state.merchant,
      [sale, { ...sale, id: 's2', demo: true }, { ...sale, id: 's3', store: 'Another store' }],
      now,
    );
    expect(result.history).toBe(1);
    expect(result.wins).toBe(1);
  });
  it('explains channel data, falls back to blended comps, and respects the profit floor', () => {
    const direct = channelSuggestion(item, comps, state.merchant, 'eBay', 0, now)!;
    expect(direct.evidence).toBe('2 channel sold comps');
    const aged = channelSuggestion(item, comps, state.merchant, 'Shopify', 100, now)!;
    expect(aged.evidence).toBe('Blended sold comps');
    expect(aged.markdown).toBe(0.15);
    expect(aged.profit).toBeGreaterThanOrEqual(state.merchant.targetProfit);
    expect(channelSuggestion(item, [], state.merchant, 'eBay', 0, now)).toBeNull();
  });
});
describe('household matching', () => {
  it('matches goals to adult, child and pet, rather than just category', () => {
    expect(householdScore(item, state).best?.goal.personId).toBe('you');
    expect(
      householdScore({ ...item, size: '4T', color: 'Blue', theme: 'Rainwear' }, state).best?.goal
        .personId,
    ).toBe('child');
    expect(householdScore(examples.pet, state).best?.goal.personId).toBe('pet');
  });
  it('caps a size mismatch and accounts for budget including repairs', () => {
    expect(householdScore({ ...item, size: 'XXL' }, state).score).toBeLessThanOrEqual(45);
    expect(householdScore({ ...item, repair: 20 }, state).best?.withinBudget).toBe(false);
  });
  it('penalizes owned duplicates for the same person and size', () => {
    const owned: InventoryItem = {
      ...item,
      id: 'i',
      added: now.toISOString(),
      ownerId: 'you',
      mode: 'household',
      status: 'Owned',
      evidence: 'manual',
    };
    const result = householdScore(item, { ...state, inventory: [owned] });
    expect(result.best?.duplicate).toBe(true);
    expect(result.score).toBeLessThan(householdScore(item, state).score!);
  });
  it('ignores fulfilled goals and returns unknown when no category matches', () => {
    expect(
      householdScore(item, { ...state, goals: state.goals.map((g) => ({ ...g, fulfilled: true })) })
        .score,
    ).toBeNull();
    expect(householdScore(examples.lamp, state).score).toBeNull();
  });
  it('rejects negative, non-finite prices and invalid conditions', () => {
    expect(candidateSchema.safeParse({ ...item, cost: -1 }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...item, cost: Infinity }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...item, condition: 'New' }).success).toBe(false);
  });
});
it('all marketplace writes fail closed without connections', async () => {
  const adapter = disconnectedAdapter('ebay');
  expect((await adapter.connection()).status).toBe('disconnected');
  expect((await adapter.publish({} as never, 'unique-key')).ok).toBe(false);
  expect((await adapter.updatePrice('external-id', 50, 'key')).ok).toBe(false);
  await expect(adapter.sync()).rejects.toThrow('not connected');
});
