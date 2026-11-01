import { useCallback, useEffect, useRef, useState } from 'react';
import { summariesSchema, type CommunitySummary } from './community';
import { allPlaces } from './catalogue';
export function useCommunitySummaries(placeIds: string[]) {
  const key = placeIds
    .filter((id) => allPlaces.some((p) => p.id === id))
    .sort()
    .slice(0, 50)
    .join(',');
  const [summaries, setSummaries] = useState<Record<string, CommunitySummary>>({});
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    if (!key) {
      setSummaries({});
      setError('');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(`/api/community/summary?placeIds=${encodeURIComponent(key)}`, {
        cache: 'no-store',
        signal: abort.signal,
      });
      if (!response.ok) throw new Error('Community updates are unavailable right now.');
      const value = summariesSchema.parse(await response.json());
      if (!abort.signal.aborted) {
        setSummaries(value);
        setError('');
      }
    } catch {
      if (!abort.signal.aborted) {
        setSummaries({});
        setError('Community updates are unavailable right now.');
      }
    }
  }, [key]);
  useEffect(() => {
    setSummaries({});
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) void refresh();
    }, 60000);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [refresh]);
  return { summaries, error, refresh };
}
