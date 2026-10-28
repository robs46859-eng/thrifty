import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { AppState } from './model';
export type Page = 'scan' | 'household' | 'merchant' | 'pricing' | 'connections';
export type Workspace = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  mode: 'merchant' | 'household';
  setMode: (mode: 'merchant' | 'household') => void;
  navigate: (page: Page) => void;
  toast: (message: string) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('Missing workspace');
  return ctx;
}
