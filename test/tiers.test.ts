import { describe, expect, it } from 'vitest';
import { bestTier, priceAt, tierLabel } from '../src/lib/tiers';
import { itemFromOffer, lineTotal } from '../src/lib/list';
import { watchMatches } from '../src/lib/watch';
import { listLink, parseIncoming } from '../src/lib/share';
import type { Offer, Watch } from '../src/lib/types';

const lindt: Offer = {
  id: 'M-1',
  store: 'metro',
  brand: 'REGALIDEA',
  name: 'Комплект Lindt',
  desc: '',
  pack: '1,56 кг',
  price: 25.55,
  old: 28.28,
  pct: 10,
  unit: 16.38,
  unitOf: 'kg',
  from: '2026-11-19',
  to: '2026-12-14',
  image: null,
  url: null,
  cat: 'sweets',
  tiers: [
    { min: 6, price: 25 },
    { min: 20, price: 24.28 },
  ],
};
const watch = (w: Partial<Watch>): Watch => ({ id: 'w', term: 'lindt', maxPrice: null, minPct: null, maxUnit: null, exclude: [], createdAt: 0, ...w });

describe('quantity prices', () => {
  it('picks the price per piece for a quantity', () => {
    expect(priceAt(25.55, lindt.tiers, 1)).toBe(25.55);
    expect(priceAt(25.55, lindt.tiers, 6)).toBe(25);
    expect(priceAt(25.55, lindt.tiers, 19)).toBe(25);
    expect(priceAt(25.55, lindt.tiers, 20)).toBe(24.28);
    expect(priceAt(3, undefined, 10)).toBe(3);
    expect(bestTier(lindt.tiers)).toEqual({ min: 20, price: 24.28 });
    expect(tierLabel({ min: 20, price: 24.28 })).toBe('€24.28 от 20 бр.');
  });

  it('totals a list line at its quantity', () => {
    const it1 = itemFromOffer(lindt);
    expect(it1.tiers).toEqual(lindt.tiers);
    expect(lineTotal(it1)).toBe(25.55);
    expect(lineTotal({ ...it1, qty: 2 })).toBe(51.1);
    expect(lineTotal({ ...it1, qty: 20 })).toBe(485.6);
    expect(lineTotal({ ...itemFromOffer({ ...lindt, tiers: undefined }), qty: 3 })).toBe(76.65);
  });

  it('meets a follow limit through a quantity price', () => {
    const today = '2026-11-22';
    expect(watchMatches(watch({ maxPrice: 24.5 }), lindt, today)).toBe(true);
    expect(watchMatches(watch({ maxPrice: 24 }), lindt, today)).toBe(false);
    expect(watchMatches(watch({ maxUnit: 15.6, unitKind: 'kg' }), lindt, today)).toBe(true);
    expect(watchMatches(watch({ maxPrice: 24.5 }), { ...lindt, tiers: undefined }, today)).toBe(false);
  });

  it('shares quantities in list links', () => {
    (globalThis as unknown as { location: object }).location = { origin: 'https://livanov.github.io', pathname: '/dealer/' };
    const link = listLink([{ ...itemFromOffer(lindt), qty: 20 }, itemFromOffer({ ...lindt, id: 'M-2' })]);
    const got = parseIncoming(link.slice(link.indexOf('#')));
    expect(got?.kind).toBe('list');
    if (got?.kind === 'list') {
      expect(got.items[0].qty).toBe(20);
      expect(got.items[1].qty).toBeUndefined();
    }
  });
});
