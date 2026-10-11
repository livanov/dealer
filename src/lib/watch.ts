// Watchlist matching and the refresh → compare → notify cycle. Shared by the
// page (on open / pull to refresh) and the service worker (periodic
// background sync), so everything here sticks to fetch + IndexedDB.

import type { Counts, DataFile, InboxItem, Offer, Watch } from './types';
import { unitPriceIn } from './units';
import { idbGet, idbSet } from './idb';
import { addDays, euro, isExpired, isoDay, searchKey, whenLabel } from './offers';
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
  if (data) await markNotified(watches, data.offers, await getNotified());
}

/** For each notified `watchId|offerId`: the last day to remember it. */
export type Notified = Record<string, string>;
const GRACE_DAYS = 14;

/**
 * Matches the user hasn't been told about, and the notified keys to store.
 * A key stays until its offer ends (or GRACE_DAYS after its last match, for
 * offers without an end date), so an offer that misses a check (store turned
 * off, left out of one data build) doesn't come back as new.
 */
export function freshMatches(watches: Watch[], offers: Offer[], notified: Notified, today: string, ctx: MatchCtx = {}) {
  const fresh: { watch: Watch; hits: Offer[] }[] = [];
  const keep: Notified = {};
  for (const [k, until] of Object.entries(notified)) if (until >= today) keep[k] = until;
  for (const w of watches) {
    const hits = offers.filter((o) => watchMatches(w, o, today, ctx));
    // Keys past their day still count: Kaufland lists next week's promo under the same id.
    const unseen = hits.filter((o) => !notified[`${w.id}|${o.id}`]);
    if (unseen.length) fresh.push({ watch: w, hits: unseen });
    for (const o of hits) keep[`${w.id}|${o.id}`] = o.to ?? addDays(today, GRACE_DAYS);
  }
  return { fresh, notified: keep };
}

/** Older versions stored only the keys of current matches, under 'notified'. */
export const fromLegacy = (keys: string[], today: string): Notified =>
  Object.fromEntries(keys.map((k) => [k, addDays(today, GRACE_DAYS)]));

async function getNotified(): Promise<Notified> {
  return (await idbGet<Notified>('notifiedUntil')) ?? fromLegacy((await idbGet<string[]>('notified')) ?? [], isoDay());
}

async function markNotified(watches: Watch[], offers: Offer[], notified: Notified) {
  const res = freshMatches(watches, offers, notified, isoDay(), await getCtx());
  await idbSet('notifiedUntil', res.notified);
  return res.fresh;
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
 * haven't told the user about yet. Returns the data (fresh, or cached on failure).
 */
export async function refresh(dataUrl: string, notify: Notify | null): Promise<DataFile | undefined> {
  let data: DataFile | undefined;
  try {
    const res = await fetch(dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as DataFile;
    await idbSet('data', data);
    await idbSet('checkedAt', Date.now());
  } catch {
    return getCachedData();
  }

  const watches = await getWatches();
  const notified = await getNotified();
  const fresh = await markNotified(watches, data.offers, notified);
  if (!fresh.length) return data;

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
  return data;
}
