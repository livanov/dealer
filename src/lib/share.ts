// Shareable links. Everything travels in the URL hash (#/route?params), so a
// static site can open shared offers, searches and lists without a server.

import type { Filters, GroupKey, ListItem, Offer, SortKey } from './types';
import { euro } from './offers';

const base = () => `${location.origin}${location.pathname}`;

// ---- base64url for UTF-8 JSON ------------------------------------------
function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---- links ----------------------------------------------------------------
export const offerLink = (o: Offer) => `${base()}#/offers?o=${encodeURIComponent(o.id)}`;

export interface SharedSearch {
  q: string;
  filters: Pick<Filters, 'stores' | 'cats' | 'validity' | 'minPct'>;
  sort: SortKey;
  group: GroupKey;
}

export function searchLink(s: SharedSearch): string {
  const p = new URLSearchParams({ s: '1' });
  if (s.q.trim()) p.set('q', s.q.trim());
  if (s.filters.stores.length) p.set('st', s.filters.stores.join(','));
  if (s.filters.cats.length) p.set('ct', s.filters.cats.join(','));
  if (s.filters.validity !== 'now') p.set('v', s.filters.validity);
  if (s.filters.minPct) p.set('m', String(s.filters.minPct));
  p.set('sort', s.sort);
  if (s.group !== 'none') p.set('g', s.group);
  return `${base()}#/offers?${p}`;
}

/** Compact list payload: [id, store, name, pack, price, to]. */
type Row = [string, string, string, string, number, string | null];

export function listLink(items: ListItem[]): string {
  const rows: Row[] = items.map((i) => [i.id, i.store, i.name, i.pack, i.price, i.to]);
  return `${base()}#/list?l=${toB64(JSON.stringify(rows))}`;
}

// ---- reading an incoming link ----------------------------------------------
export type Incoming =
  | { kind: 'offer'; id: string }
  | { kind: 'search'; search: SharedSearch }
  | { kind: 'list'; items: ListItem[] }
  | null;

const SORTS: SortKey[] = ['relevance', 'pct', 'price', 'unit', 'ending', 'newest'];
const GROUPS: GroupKey[] = ['none', 'store', 'cat', 'validity'];

export function parseIncoming(hash: string): Incoming {
  const qi = hash.indexOf('?');
  if (qi < 0) return null;
  const p = new URLSearchParams(hash.slice(qi + 1));
  const o = p.get('o');
  if (o) return { kind: 'offer', id: o };
  const l = p.get('l');
  if (l) {
    try {
      const rows = JSON.parse(fromB64(l)) as Row[];
      const items = rows
        .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && typeof r[4] === 'number')
        .slice(0, 200)
        .map(([id, store, name, pack, price, to]) => ({ id, store: String(store), name: String(name), pack: String(pack ?? ''), price, to: to ?? null, done: false }));
      return items.length ? { kind: 'list', items } : null;
    } catch {
      return null;
    }
  }
  if (p.get('s')) {
    const csv = (k: string) => (p.get(k) ?? '').split(',').filter(Boolean);
    const v = p.get('v');
    const sort = p.get('sort') as SortKey;
    const group = p.get('g') as GroupKey;
    return {
      kind: 'search',
      search: {
        q: p.get('q') ?? '',
        filters: {
          stores: csv('st'),
          cats: csv('ct'),
          validity: v === 'upcoming' || v === 'all' ? v : 'now',
          minPct: Math.max(0, Math.min(90, Number(p.get('m')) || 0)),
        },
        sort: SORTS.includes(sort) ? sort : 'relevance',
        group: GROUPS.includes(group) ? group : 'none',
      },
    };
  }
  return null;
}

// ---- texts ----------------------------------------------------------------
export function offerText(o: Offer, storeName: string, when?: string): string {
  const name = `${o.brand ? `${o.brand} ` : ''}${o.name}${o.pack ? `, ${o.pack}` : ''}`;
  return `${name} – ${euro(o.price)}${o.pct ? ` (−${o.pct}%)` : ''} в ${storeName}${when ? `, ${when}` : ''}`;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Native share sheet where available, otherwise copy to the clipboard. */
export async function shareOrCopy(data: { title: string; text?: string; url: string }): Promise<ShareResult> {
  try {
    if (navigator.share) {
      await navigator.share(data);
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(data.text ? `${data.text}\n${data.url}` : data.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
