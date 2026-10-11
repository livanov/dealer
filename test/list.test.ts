import { describe, expect, it } from 'vitest';
import { listStatus, nameSimilarity, itemFromOffer, removedBy, restoreItems } from '../src/lib/list';
import type { Offer } from '../src/lib/types';

const offer = (p: Partial<Offer>): Offer =>
  ({ id: 'K-1', store: 'kaufland', brand: 'Вълчев', name: 'Крема сирене различни видове', desc: '', pack: '125 г', price: 0.85, old: 1.25, pct: 32, unit: 6.8, unitOf: 'kg', from: '2026-10-05', to: '2026-10-11', image: null, url: null, cat: 'dairy', ...p }) as Offer;

describe('shopping list status', () => {
  const item = itemFromOffer(offer({}));
  it('is current while the same offer runs', () => {
    expect(listStatus(item, [offer({})], '2026-10-10')).toEqual({ expired: false });
  });
  it('offers the new price when the same offer changes', () => {
    const st = listStatus(item, [offer({ price: 0.79 })], '2026-10-10');
    expect(st.expired).toBe(false);
    expect(st.update?.price).toBe(0.79);
  });
  it('expires after the end date or when the offer is gone', () => {
    expect(listStatus(item, [offer({})], '2026-10-12').expired).toBe(true);
    expect(listStatus(item, [], '2026-10-10').expired).toBe(true);
  });
  it('finds the product on promo again with a slightly different title', () => {
    const next = offer({ id: 'K-2', name: 'Крема сирене различни видове ', from: '2026-10-19', to: '2026-10-25', price: 0.89 });
    const other = offer({ id: 'K-3', brand: 'Hochland', name: 'Крема сирене', pack: '200 г' });
    const st = listStatus(item, [next, other], '2026-10-20');
    expect(st).toMatchObject({ expired: true, update: { id: 'K-2' } });
  });
  it('ignores other stores, other packs and different products', () => {
    const offers = [
      offer({ id: 'L-1', store: 'lidl', to: '2026-10-30' }),
      offer({ id: 'K-4', pack: '200 г', to: '2026-10-30' }),
      offer({ id: 'K-5', name: 'Кашкавал', to: '2026-10-30' }),
    ];
    expect(listStatus(item, offers, '2026-10-20').update).toBeUndefined();
  });
  it('compares names by shared words', () => {
    expect(nameSimilarity('Вълчев Крема сирене', 'Вълчев крема сирене')).toBe(1);
    expect(nameSimilarity('Вълчев Крема сирене', 'Кашкавал')).toBe(0);
  });
});

describe('undoing a removal', () => {
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id) => itemFromOffer(offer({ id, name: id })));

  it('puts the removed items back in place and keeps changes made since', () => {
    const removed = removedBy([a, b, c, d], (i) => i.id === 'B' || i.id === 'D');
    const ticked = { ...c, done: true };
    expect(restoreItems([a, ticked], removed)).toEqual([a, b, ticked, d]);
  });

  it('skips an item that is already back on the list', () => {
    const removed = removedBy([a, b], (i) => i.id === 'B');
    expect(restoreItems([a, b], removed)).toEqual([a, b]);
  });
});
