import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/seed';
import { loadState, parseImport, saveState } from '../src/lib/storage';
describe('workspace durability', () => {
  it('round-trips all workspace collections', () => {
    const state = initialState();
    expect(parseImport(JSON.stringify(state))).toEqual(state);
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
