import { describe, expect, it } from 'vitest';
import { initialState, examples } from '../src/lib/seed';
import { loadState, parseImport, saveState } from '../src/lib/storage';
describe('workspace durability', () => {
  it('round-trips all workspace collections', () => {
    const state = initialState();
    expect(parseImport(JSON.stringify(state))).toEqual(state);
  });
  it('preserves purchase locations in backups and accepts older items without them', () => {
    const state = initialState();
    state.inventory.push({
      ...examples.fleece,
      id: 'purchase-test',
      added: '2026-11-01T18:00:00Z',
      ownerId: 'you',
      mode: 'household',
      status: 'Owned',
      evidence: 'manual',
    });
    expect(parseImport(JSON.stringify(state)).inventory[0].purchaseLocation).toBeUndefined();
    state.inventory[0].purchaseLocation = {
      name: 'Public market',
      address: '100 Main St, Littleton, CO',
      placeId: 'official:test-market',
      point: { lat: 39.61, lng: -105.01 },
    };
    expect(parseImport(JSON.stringify(state)).inventory[0].purchaseLocation).toEqual(
      state.inventory[0].purchaseLocation,
    );
    const invalid = structuredClone(state);
    invalid.inventory[0].purchaseLocation!.point!.lat = 200;
    expect(() => parseImport(JSON.stringify(invalid))).toThrow();
  });
  it('preserves corrupt original data and reports a recoverable warning', () => {
    const original = '{bad json';
    const storage = { getItem: () => original };
    const result = loadState(storage);
    expect(result.warning).toContain('unavailable or unreadable');
    expect(storage.getItem()).toBe(original);
  });
  it('reports quota failures instead of pretending to save', () => {
    expect(
      saveState(initialState(), {
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ).toContain('Could not save');
  });
  it('rejects malformed, foreign-version, duplicate and orphaned backup records', () => {
    const state = initialState();
    expect(() => parseImport('{')).toThrow();
    expect(() => parseImport(JSON.stringify({ ...state, version: 2 }))).toThrow();
    expect(() =>
      parseImport(JSON.stringify({ ...state, profiles: [...state.profiles, state.profiles[0]] })),
    ).toThrow('Duplicate');
    expect(() => parseImport(JSON.stringify({ ...state, profiles: [] }))).toThrow('Missing linked');
  });
});
