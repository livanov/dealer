import { useEffect, useState } from 'preact/hooks';
import type { Filters, GroupKey, ListItem, SortKey } from './types';

export type ThemePref = 'system' | 'light' | 'dark';

export const DEFAULT_FILTERS: Filters = { stores: [], cats: [], validity: 'now', minPct: 0, hide: [] };
/** Hidden words are a personal list built up over time, so clearing keeps them. */
export const clearFilters = (f: Filters): Filters => ({ ...DEFAULT_FILTERS, hide: f.hide });

/** useState that persists to localStorage (best effort — private mode may refuse). */
export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`dealer:${key}`);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`dealer:${key}`, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

export const useTheme = () => useStored<ThemePref>('theme', 'system');
export const useFilters = () => useStored<Filters>('filters', DEFAULT_FILTERS);
export const useSort = () => useStored<SortKey>('sort', 'relevance');

// One-time switch to the new default sort for people still on the old one.
try {
  if (!localStorage.getItem('dealer:sortV2')) {
    if (localStorage.getItem('dealer:sort') === '"pct"') localStorage.setItem('dealer:sort', '"relevance"');
    localStorage.setItem('dealer:sortV2', '1');
  }
} catch {}
export const useGroup = () => useStored<GroupKey>('group', 'none');
export const useList = () => useStored<ListItem[]>('list', []);
/** Category ids in the user's preferred order (empty = the default supermarket order). */
export const useCatOrder = () => useStored<string[]>('catOrder', []);

export function activeFilterCount(f: Filters): number {
  return (
    (f.stores.length ? 1 : 0) +
    (f.cats.length ? 1 : 0) +
    (f.validity !== 'now' ? 1 : 0) +
    (f.minPct > 0 ? 1 : 0) +
    (f.hide.length ? 1 : 0)
  );
}

/** Apply the theme preference to <html data-theme> and keep it in sync with the OS. */
export function useApplyTheme(pref: ThemePref) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E1012' : '#F5F6F2');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}
