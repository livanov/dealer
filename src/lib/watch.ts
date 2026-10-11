// Watchlist matching and the refresh → compare → notify cycle. Shared by the
// page (on open / pull to refresh) and the service worker (periodic
// background sync), so everything here sticks to fetch + IndexedDB.

import type { Counts, DataFile, InboxItem, Offer, Watch } from './types';
import { unitPriceIn } from './units';
import { idbGet, idbSet } from './idb';
import { euro, isExpired, isoDay, searchKey, whenLabel } from './offers';
import { fold, matchesTokens, tokens } from './text';

/** Things on the device that affect matching: typed-in piece counts, stores turned off. */
export interface MatchCtx {
  counts?: Counts;
  hiddenStores?: string[];
}

export function watchMatches(w: Watch, o: Offer, today: string, ctx: MatchCtx = {}): boolean {
  if (isExpired(o, today)) return false;
  if (ctx.hiddenStores?.includes(o.store)) return false;
  const key = searchKey(o);
  if (!matchesTokens(key, tokens(w.term))) return false;
  if (w.exclude.some((x) => x && key.includes(fold(x)))) return false;
  const limits = [
    w.maxPrice != null ? o.price <= w.maxPrice : null,
    w.minPct != null ? (o.pct ?? 0) >= w.minPct : null,
    w.maxUnit != null ? unitLimitOk(w, o, ctx.counts) : null,
  ].filter((x) => x !== null);
  // Any one satisfied limit is enough ("≤ €5 or ≥ 25% off"); no limits = any match.
  return limits.length === 0 || limits.some(Boolean);
}

function unitLimitOk(w: Watch, o: Offer, counts: Counts = {}): boolean {
  if (w.unitKind) {
    const u = unitPriceIn(o, w.unitKind, counts);
    if (!u) return !!(w.unitKind === 'pc' && w.includeUnknown);
    return u.value <= w.maxUnit!;
  }
  // Older watches: "per kg or litre", whichever the offer has.
  return o.unit != null && o.unit <= w.maxUnit!;
}

export const getCounts = async () => (await idbGet<Counts>('counts')) ?? {};
export const getHiddenStores = async () => (await idbGet<string[]>('hiddenStores')) ?? [];
const getCtx = async (): Promise<MatchCtx> => ({ counts: await getCounts(), hiddenStores: await getHiddenStores() });

export const getWatches = async () => (await idbGet<Watch[]>('watches')) ?? [];
export const getInbox = async () => (await idbGet<InboxItem[]>('inbox')) ?? [];
export const saveInbox = (items: InboxItem[]) => idbSet('inbox', items.slice(0, 100));
export const getCachedData = () => idbGet<DataFile>('data');

/** Save watches; offers already matching a new watch count as "seen" so we don't ping about them. */
export async function saveWatches(watches: Watch[]) {
  await idbSet('watches', watches);
  const data = await getCachedData();
  if (data) await markNotified(watches, data.offers, new Set((await idbGet<string[]>('notified')) ?? []));
}

async function markNotified(watches: Watch[], offers: Offer[], notified: Set<string>) {
  const today = isoDay();
  const ctx = await getCtx();
  const fresh: { watch: Watch; hits: Offer[] }[] = [];
  const keep = new Set<string>();
  for (const w of watches) {
    const hits = offers.filter((o) => watchMatches(w, o, today, ctx));
    const unseen = hits.filter((o) => !notified.has(`${w.id}|${o.id}`));
    if (unseen.length) fresh.push({ watch: w, hits: unseen });
    for (const o of hits) keep.add(`${w.id}|${o.id}`);
  }
  // Only keep keys for offers that still exist, so the set can't grow forever.
  await idbSet('notified', [...keep]);
  return fresh;
}

/** One line about the cheapest hit: store · price (−pct%) · when · and N more. */
export function alertBody(hits: Offer[], data: DataFile, today: string) {
  const best = hits.slice().sort((a, b) => a.price - b.price)[0];
  const store = data.stores.find((s) => s.id === best.store)?.name ?? best.store;
  const when = whenLabel(best, today)?.text;
  const parts = [store, `${euro(best.price)}${best.pct ? ` (−${best.pct}%)` : ''}`, when].filter(Boolean);
  return parts.join(' · ') + (hits.length > 1 ? ` · и още ${hits.length - 1}` : '');
}

export const alertFor = (term: string, body: string, watchId: string): [string, NotificationOptions] => [
  `„${term}“ е в промоция`,
  { body, tag: `watch-${watchId}`, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: '#/inbox' } },
];

export type Notify = (title: string, options: NotificationOptions) => Promise<void> | void;

/**
 * Download the latest offers, cache them, and notify about watch matches we
 * haven't told the user about yet. Returns the data (fresh, or cached on
 * failure) and whether the download worked.
 */
export async function refresh(
  dataUrl: string,
  notify: Notify | null,
): Promise<{ data: DataFile | undefined; fetched: boolean }> {
  let data: DataFile | undefined;
  try {
    const res = await fetch(dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as DataFile;
  } catch {
    return { data: await getCachedData(), fetched: false };
  }
  try {
    await idbSet('data', data);
    await idbSet('checkedAt', Date.now());
  } catch {
    // Saving failed (storage full?). Show the download anyway; alerts wait for
    // a refresh that can also save which offers were already announced.
    return { data, fetched: true };
  }

  const watches = await getWatches();
  const notified = new Set((await idbGet<string[]>('notified')) ?? []);
  const fresh = await markNotified(watches, data.offers, notified);
  if (!fresh.length) return { data, fetched: true };

  // Every new match lands in the in-app inbox; a system notification is extra.
  const today = isoDay();
  const items: InboxItem[] = fresh.map(({ watch, hits }) => ({
    id: `${watch.id}-${Date.now()}`,
    watchId: watch.id,
    term: watch.term,
    body: alertBody(hits, data!, today),
    at: Date.now(),
    read: false,
  }));
  await saveInbox([...items, ...(await getInbox())]);
  if (notify) for (const it of items) await notify(...alertFor(it.term, it.body, it.watchId));
  return { data, fetched: true };
}
