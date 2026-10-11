import { describe, expect, it } from 'vitest';
import { fold, tokens, matchesTokens } from '../src/lib/text';
import { filterOffers, groupOffers, sortOffers, whenLabel } from '../src/lib/offers';
import { watchMatches } from '../src/lib/watch';
import { DEFAULT_FILTERS } from '../src/lib/prefs';
import type { Offer, Watch } from '../src/lib/types';

const offer = (over: Partial<Offer>): Offer => ({
  id: Math.random().toString(36),
  store: 'kaufland',
  brand: '',
  name: 'Продукт',
  desc: '',
  pack: '',
  price: 1,
  old: null,
  pct: null,
  unit: null,
  unitOf: null,
  from: '2026-10-05',
  to: '2026-10-11',
  image: null,
  url: null,
  cat: 'other',
  ...over,
});
const TODAY = '2026-10-10';

describe('search folding', () => {
  it('matches Latin queries against Cyrillic text', () => {
    expect(matchesTokens(fold('Бяло саламурено сирене'), tokens('sirene'))).toBe(true);
    expect(matchesTokens(fold('Nutella'), tokens('нутела'))).toBe(true);
    expect(matchesTokens(fold('Nescafé Dolce Gusto'), tokens('nescafe dolce'))).toBe(true);
    expect(matchesTokens(fold('Кафе'), tokens('чай'))).toBe(false);
  });
});

describe('filterOffers', () => {
  const list = [
    offer({ name: 'Краве масло', pct: 46, store: 'kaufland' }),
    offer({ name: 'Моторно масло', pct: 50, store: 'kaufland', cat: 'nonfood' }),
    offer({ name: 'Ирландско масло', pct: 30, store: 'lidl', from: '2026-10-12', to: '2026-10-18' }),
    offer({ name: 'Старо', to: '2026-10-01' }),
  ];
  it('hides expired and upcoming by default', () => {
    expect(filterOffers(list, 'масло', DEFAULT_FILTERS, TODAY).map((o) => o.name)).toEqual(['Краве масло', 'Моторно масло']);
  });
  it('applies hidden words, stores and min discount', () => {
    const f = { ...DEFAULT_FILTERS, validity: 'all' as const, hide: ['моторно'], minPct: 40 };
    expect(filterOffers(list, 'масло', f, TODAY).map((o) => o.name)).toEqual(['Краве масло']);
    expect(filterOffers(list, '', { ...DEFAULT_FILTERS, validity: 'upcoming', stores: ['lidl'] }, TODAY)).toHaveLength(1);
  });
});

describe('sorting, grouping, labels', () => {
  it('puts offers without a unit price last', () => {
    const s = sortOffers([offer({ unit: null }), offer({ unit: 3, unitOf: 'kg' }), offer({ unit: 1, unitOf: 'kg' })], 'unit');
    expect(s.map((o) => o.unit)).toEqual([1, 3, null]);
  });
  it('groups by validity bucket', () => {
    const g = groupOffers(
      [offer({ to: TODAY }), offer({ to: '2026-10-11' }), offer({ to: null, from: null }), offer({ from: '2026-10-12' })],
      'validity',
      [],
      [],
      TODAY,
    );
    expect(g.map((x) => x.key)).toEqual(['today', 'tomorrow', 'nodate', 'upcoming']);
  });
  it('labels validity in Bulgarian', () => {
    expect(whenLabel(offer({ to: '2026-10-11' }), TODAY)?.text).toBe('до утре');
    expect(whenLabel(offer({ from: '2026-10-12', to: '2026-10-18' }), TODAY)?.text).toBe('от пн 12.10');
    expect(whenLabel(offer({ to: '2026-10-14' }), TODAY)?.text).toBe('до ср 14.10');
  });
});

describe('watchMatches', () => {
  const w = (over: Partial<Watch>): Watch => ({ id: 'w', term: 'dolce gusto', maxPrice: null, minPct: null, maxUnit: null, exclude: [], createdAt: 0, ...over });
  const dg = offer({ name: 'Капсули Dolce Gusto', price: 4.59, pct: 29 });
  it('matches the term when there are no limits', () => expect(watchMatches(w({}), dg, TODAY)).toBe(true));
  it('passes when any one limit is met', () => {
    expect(watchMatches(w({ maxPrice: 5, minPct: 50 }), dg, TODAY)).toBe(true);
    expect(watchMatches(w({ maxPrice: 4, minPct: 25 }), dg, TODAY)).toBe(true);
    expect(watchMatches(w({ maxPrice: 4, minPct: 30 }), dg, TODAY)).toBe(false);
  });
  it('respects excluded words and expiry', () => {
    expect(watchMatches(w({ exclude: ['капсули'] }), dg, TODAY)).toBe(false);
    expect(watchMatches(w({}), { ...dg, to: '2026-10-01' }, TODAY)).toBe(false);
  });
  it('reads a unit limit without a unit as per kg or litre', () => {
    const milk = offer({ name: 'Прясно мляко', unit: 1.79, unitOf: 'l' });
    const yogurt = offer({ name: 'Кисело мляко', unit: 2.48, unitOf: 'kg' });
    expect(watchMatches(w({ term: 'мляко', maxUnit: 2.5 }), milk, TODAY)).toBe(true);
    expect(watchMatches(w({ term: 'мляко', maxUnit: 2.5 }), yogurt, TODAY)).toBe(true);
    expect(watchMatches(w({ term: 'мляко', maxUnit: 2.5, unitKind: 'kg' }), milk, TODAY)).toBe(false);
  });
});

describe('relevance sort', () => {
  it('orders by the user category order, then by discount', async () => {
    const { orderCategories } = await import('../src/lib/offers');
    const cats = [
      { id: 'produce', label: 'Плод' },
      { id: 'meat', label: 'Месо' },
      { id: 'canned', label: 'Консерви' },
    ];
    const ordered = orderCategories(cats, ['meat', 'canned']);
    expect(ordered.map((c) => c.id)).toEqual(['meat', 'canned', 'produce']);
    const rank = Object.fromEntries(ordered.map((c, i) => [c.id, i]));
    const list = [
      offer({ cat: 'produce', pct: 60 }),
      offer({ cat: 'canned', pct: 10 }),
      offer({ cat: 'meat', pct: 5 }),
      offer({ cat: 'meat', pct: 40 }),
    ];
    expect(sortOffers(list, 'relevance', rank).map((o) => `${o.cat}:${o.pct}`)).toEqual(['meat:40', 'meat:5', 'canned:10', 'produce:60']);
  });
});

describe('price per piece', () => {
  const w = (over: Partial<Watch>): Watch => ({ id: 'w', term: 'кафе капсули', maxPrice: null, minPct: null, maxUnit: 0.25, unitKind: 'pc', exclude: [], createdAt: 0, ...over });
  const pellini = offer({ id: 'L-1', name: 'Кафе капсули', pack: '30 бр.', price: 6.39, pcs: 30 });
  const kimbo = offer({ id: 'L-2', name: 'Кафе капсули', pack: '30 бр.', price: 7.99, pcs: 30 });
  const dg = offer({ id: 'K-20716211', name: 'Кафе капсули Dolce Gusto', pack: '168 - 210 г', price: 8.69 });

  it('compares by price per capsule, whatever the box size', () => {
    expect(watchMatches(w({}), pellini, TODAY)).toBe(true); // €0.213
    expect(watchMatches(w({}), kimbo, TODAY)).toBe(false); // €0.266
  });
  it('uses a count the user typed in, and skips unknown counts unless asked', () => {
    expect(watchMatches(w({}), dg, TODAY)).toBe(false);
    expect(watchMatches(w({ includeUnknown: true }), dg, TODAY)).toBe(true);
    expect(watchMatches(w({}), dg, TODAY, { counts: { 'K-20716211': 30 } })).toBe(false); // €0.29
    expect(watchMatches(w({ maxUnit: 0.3 }), dg, TODAY, { counts: { 'K-20716211': 30 } })).toBe(true);
  });
  it('ignores stores the user turned off', () => {
    expect(watchMatches(w({}), pellini, TODAY, { hiddenStores: ['kaufland'] })).toBe(false);
  });
});
