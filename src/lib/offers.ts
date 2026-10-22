import type { Category, Counts, Filters, GroupKey, Offer, SortKey, Store } from './types';
import { bestUnit } from './units';
import { fold, matchesTokens, tokens } from './text';

const keyCache = new WeakMap<Offer, string>();
export function searchKey(o: Offer): string {
  let k = keyCache.get(o);
  if (k === undefined) {
    k = fold(`${o.brand} ${o.name} ${o.desc} ${o.pack} ${o.store}`);
    keyCache.set(o, k);
  }
  return k;
}

/** Local calendar date as YYYY-MM-DD (offers are dated in Bulgarian local time). */
export function isoDay(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export const isUpcoming = (o: Offer, today: string) => !!o.from && o.from > today;
export const isExpired = (o: Offer, today: string) => !!o.to && o.to < today;

export function filterOffers(all: Offer[], query: string, f: Filters, today: string): Offer[] {
  const toks = tokens(query);
  const hide = f.hide.map(fold).filter(Boolean);
  return all.filter((o) => {
    if (isExpired(o, today)) return false;
    if (f.stores.length && !f.stores.includes(o.store)) return false;
    if (f.cats.length && !f.cats.includes(o.cat)) return false;
    if (f.validity === 'now' && isUpcoming(o, today)) return false;
    if (f.validity === 'upcoming' && !isUpcoming(o, today)) return false;
    if (f.minPct > 0 && (o.pct ?? 0) < f.minPct) return false;
    const key = searchKey(o);
    if (toks.length && !matchesTokens(key, toks)) return false;
    if (hide.length && hide.some((h) => key.includes(h))) return false;
    return true;
  });
}

const nullsLast = (a: number | string | null, b: number | string | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0;

/** Apply the user's category order (unknown/new categories keep their default place at the end). */
export function orderCategories(cats: Category[], order: string[]): Category[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return cats
    .map((c, i) => ({ c, k: pos.get(c.id) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
}

/** `rank` maps category id → position; used by the "relevance" sort. */
export function sortOffers(list: Offer[], key: SortKey, rank: Record<string, number> = {}, counts: Counts = {}): Offer[] {
  const out = list.slice();
  switch (key) {
    case 'relevance': {
      const r = (o: Offer) => rank[o.cat] ?? Number.MAX_SAFE_INTEGER;
      return out.sort((a, b) => r(a) - r(b) || (b.pct ?? -1) - (a.pct ?? -1) || a.price - b.price);
    }
    case 'pct':
      return out.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.price - b.price);
    case 'price':
      return out.sort((a, b) => a.price - b.price);
    case 'unit': {
      // Per piece, then per kg, then per litre; cheapest first within each.
      const KIND = { pc: 0, kg: 1, l: 2 } as const;
      const key = (o: Offer) => {
        const u = bestUnit(o, counts);
        return u ? KIND[u.kind] * 1e6 + u.value : null;
      };
      return out.sort((a, b) => nullsLast(key(a), key(b)));
    }
    case 'ending':
      return out.sort((a, b) => nullsLast(a.to, b.to) || (b.pct ?? -1) - (a.pct ?? -1));
    case 'newest':
      return out.sort((a, b) => nullsLast(b.from, a.from) || (b.pct ?? -1) - (a.pct ?? -1));
  }
}

export interface Group {
  key: string;
  title: string;
  color?: string;
  items: Offer[];
}

export function groupOffers(
  list: Offer[],
  by: GroupKey,
  stores: Store[],
  cats: Category[],
  today: string,
): Group[] {
  if (by === 'none') return [{ key: 'all', title: '', items: list }];
  const buckets = new Map<string, Offer[]>();
  const bucketOf = (o: Offer): string => {
    if (by === 'store') return o.store;
    if (by === 'cat') return o.cat;
    if (isUpcoming(o, today)) return 'upcoming';
    if (!o.to) return 'nodate';
    if (o.to === today) return 'today';
    if (o.to === addDays(today, 1)) return 'tomorrow';
    if (o.to <= addDays(today, 6)) return 'week';
    return 'later';
  };
  for (const o of list) {
    const k = bucketOf(o);
    const b = buckets.get(k);
    if (b) b.push(o);
    else buckets.set(k, [o]);
  }
  let order: { key: string; title: string; color?: string }[];
  if (by === 'store') order = stores.map((s) => ({ key: s.id, title: s.name, color: s.color }));
  else if (by === 'cat') order = cats.map((c) => ({ key: c.id, title: c.label }));
  else
    order = [
      { key: 'today', title: 'Изтичат днес' },
      { key: 'tomorrow', title: 'Изтичат утре' },
      { key: 'week', title: 'Тази седмица' },
      { key: 'later', title: 'По-късно' },
      { key: 'nodate', title: 'Без посочен срок' },
      { key: 'upcoming', title: 'Предстоящи' },
    ];
  return order
    .filter((g) => buckets.has(g.key))
    .map((g) => ({ ...g, items: buckets.get(g.key)! }));
}

export interface PagedGroup {
  group: Group;
  closed: boolean;
  /** Empty when closed, otherwise the offers that fit under the limit. */
  items: Offer[];
  /** Offers rendered in the groups above. */
  before: number;
}

/**
 * Spread the first `limit` offers over the open groups, in order. Collapsed groups keep
 * their heading; open groups the limit doesn't reach are left out. `more` is true while
 * open groups have offers past the limit.
 */
export function pageGroups(groups: Group[], isClosed: (g: Group) => boolean, limit: number) {
  const shown: PagedGroup[] = [];
  let open = 0;
  let budget = limit;
  for (const group of groups) {
    const closed = isClosed(group);
    if (!closed) open += group.items.length;
    if (budget <= 0 && !closed) continue;
    const items = closed ? [] : group.items.slice(0, budget);
    shown.push({ group, closed, items, before: limit - budget });
    budget -= items.length;
  }
  return { shown, more: limit < open };
}

// ---- formatting -------------------------------------------------------

const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const wd = (day: string) => WD[new Date(`${day}T12:00:00`).getDay()];

export const euro = (n: number) => `€${n.toFixed(2)}`;

export function unitLabel(o: Offer): string {
  if (o.unit == null || !o.unitOf) return '';
  return `${euro(o.unit)}/${o.unitOf === 'kg' ? 'кг' : 'л'}`;
}

export interface When {
  text: string;
  tone: 'muted' | 'soon' | 'next';
}

export function whenLabel(o: Offer, today: string): When | null {
  if (isUpcoming(o, today)) return { text: `от ${wd(o.from!)} ${dm(o.from!)}`, tone: 'next' };
  if (!o.to) return null;
  if (o.to === today) return { text: 'до днес', tone: 'soon' };
  if (o.to === addDays(today, 1)) return { text: 'до утре', tone: 'soon' };
  if (o.to <= addDays(today, 6)) return { text: `до ${wd(o.to)} ${dm(o.to)}`, tone: 'muted' };
  return { text: `до ${dm(o.to)}`, tone: 'muted' };
}
