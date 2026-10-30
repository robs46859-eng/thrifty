import { stateSchema, type AppState } from './model';
import { initialState } from './seed';
export const STORAGE_KEY = 'thrifty.workspace.v1';
export function loadState(
  storage: Pick<Storage, 'getItem'> = localStorage,
  key = STORAGE_KEY,
): {
  state: AppState;
  warning: string;
} {
  try {
    const raw = storage.getItem(key);
    if (!raw) return { state: initialState(), warning: '' };
    const result = stateSchema.safeParse(JSON.parse(raw));
    if (!result.success)
      return {
        state: initialState(),
        warning:
          'Saved data could not be read. The original is preserved; export or clear it before saving a new workspace.',
      };
    return { state: result.data, warning: '' };
  } catch {
    return {
      state: initialState(),
      warning: 'Device storage is unavailable or unreadable. Export your workspace before closing.',
    };
  }
}
export function saveState(
  state: AppState,
  storage: Pick<Storage, 'setItem'> = localStorage,
  key = STORAGE_KEY,
) {
  try {
    storage.setItem(key, JSON.stringify(stateSchema.parse(state)));
    return '';
  } catch {
    return 'Could not save to this device. Storage may be full or unavailable. Export your workspace now.';
  }
}
export function parseImport(raw: string): AppState {
  const state = stateSchema.parse(JSON.parse(raw));
  const idsUnique = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size === rows.length;
  if (
    ![state.profiles, state.goals, state.inventory, state.comps, state.sales, state.drafts].every(
      idsUnique,
    )
  )
    throw new Error('Duplicate IDs');
  if (
    state.goals.some((g) => !state.profiles.some((p) => p.id === g.personId)) ||
    state.inventory.some(
      (i) => i.mode === 'household' && !state.profiles.some((p) => p.id === i.ownerId),
    ) ||
    state.drafts.some((d) => !state.inventory.some((i) => i.id === d.itemId)) ||
    state.sales.some((s) => !state.inventory.some((i) => i.id === s.itemId))
  )
    throw new Error('Missing linked record');
  return state;
}
export function download(name: string, contents: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
