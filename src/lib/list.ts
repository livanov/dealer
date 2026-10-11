// Shopping-list items are snapshots of an offer. Once the promo ends they stay
// on the list, marked expired and left out of the totals; if the same product
// is on promo again at that store, the list offers to switch to the new offer.

import type { ListItem, Offer } from './types';
import { isExpired } from './offers';
import { fold } from './text';

export interface ListStatus {
  expired: boolean;
  /** A current offer for this item with a different price or a new id. */
  update?: Offer;
}

const words = (s: string) => new Set(fold(s).split(' ').filter((w) => w.length > 1));

/** Share of words two names have in common (0–1). */
export function nameSimilarity(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

const offerName = (o: Offer) => (o.brand ? `${o.brand} ${o.name}` : o.name);
const samePack = (a: string, b: string) => !a || !b || fold(a) === fold(b);

export function listStatus(it: ListItem, offers: Offer[], today: string): ListStatus {
  const same = offers.find((o) => o.id === it.id && !isExpired(o, today));
  if (same) return same.price !== it.price ? { expired: false, update: same } : { expired: false };
  // Gone from the data, or past its end date.
  const again = offers
    .filter((o) => o.store === it.store && !isExpired(o, today) && samePack(o.pack, it.pack))
    .map((o) => ({ o, s: nameSimilarity(offerName(o), it.name) }))
    .filter((x) => x.s >= 0.75)
    .sort((a, b) => b.s - a.s || a.o.price - b.o.price)[0]?.o;
  return { expired: true, update: again };
}

/** The list item for an offer, keeping whether it was ticked. */
export const itemFromOffer = (o: Offer, done = false): ListItem => ({
  id: o.id,
  store: o.store,
  name: offerName(o),
  pack: o.pack,
  price: o.price,
  to: o.to,
  done,
  image: o.image,
});

export interface Removed {
  item: ListItem;
  at: number;
}

/** The items `pick` selects, with their positions, so a removal can be undone. */
export const removedBy = (list: ListItem[], pick: (it: ListItem) => boolean): Removed[] =>
  list.flatMap((item, at) => (pick(item) ? [{ item, at }] : []));

/** Undo a removal: put the items back where they were, keeping changes made since. */
export function restoreItems(list: ListItem[], removed: Removed[]): ListItem[] {
  const out = [...list];
  for (const { item, at } of removed) if (!out.some((i) => i.id === item.id)) out.splice(Math.min(at, out.length), 0, item);
  return out;
}
