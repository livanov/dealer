import { describe, expect, it } from 'vitest';
import { freshMatches, fromLegacy } from '../src/lib/watch';
import type { Offer, Watch } from '../src/lib/types';

const offer = (over: Partial<Offer>): Offer => ({
  id: 'L-1',
  store: 'lidl',
  brand: '',
  name: 'Кафе капсули',
  desc: '',
  pack: '30 бр.',
  price: 6.39,
  old: null,
  pct: null,
  unit: null,
  unitOf: null,
  from: null,
  to: null,
  image: null,
  url: null,
  cat: 'coffee',
  ...over,
});
const watch: Watch = { id: 'w', term: 'кафе капсули', maxPrice: null, minPct: null, maxUnit: null, exclude: [], createdAt: 0 };
const TODAY = '2026-10-10';
// Lidl offers come without an end date, Kaufland's with one.
const lidl = offer({});
const kaufland = offer({ id: 'K-1', store: 'kaufland', to: '2026-10-11' });

describe('freshMatches', () => {
  it('announces a match once, remembering it until the offer ends or for 14 days', () => {
    const first = freshMatches([watch], [lidl, kaufland], {}, TODAY);
    expect(first.fresh).toEqual([{ watch, hits: [lidl, kaufland] }]);
    expect(first.notified).toEqual({ 'w|L-1': '2026-10-24', 'w|K-1': '2026-10-11' });
    expect(freshMatches([watch], [lidl, kaufland], first.notified, TODAY).fresh).toEqual([]);
  });

  it('stays quiet about an offer that misses a check and comes back', () => {
    const { notified } = freshMatches([watch], [lidl], {}, TODAY);
    const storeOff = freshMatches([watch], [lidl], notified, TODAY, { hiddenStores: ['lidl'] });
    expect(freshMatches([watch], [lidl], storeOff.notified, TODAY).fresh).toEqual([]);
    const leftOut = freshMatches([watch], [], notified, '2026-10-11');
    expect(freshMatches([watch], [lidl], leftOut.notified, '2026-10-11').fresh).toEqual([]);
  });

  it('forgets an offer once it has ended, or 14 days after its last match', () => {
    const { notified } = freshMatches([watch], [lidl, kaufland], {}, TODAY);
    expect(freshMatches([watch], [], notified, '2026-10-12').notified).toEqual({ 'w|L-1': '2026-10-24' });
    const later = freshMatches([watch], [], notified, '2026-10-25');
    expect(later.notified).toEqual({});
    expect(freshMatches([watch], [lidl], later.notified, '2026-10-25').fresh).toEqual([{ watch, hits: [lidl] }]);
  });

  it("stays quiet when Kaufland lists next week's promo under the same id", () => {
    const { notified } = freshMatches([watch], [kaufland], {}, '2026-10-11');
    const nextWeek = { ...kaufland, from: '2026-10-12', to: '2026-10-18' };
    expect(freshMatches([watch], [nextWeek], notified, '2026-10-12')).toEqual({ fresh: [], notified: { 'w|K-1': '2026-10-18' } });
  });

  it('takes over the keys older versions stored without announcing them again', () => {
    const { fresh, notified } = freshMatches([watch], [lidl], fromLegacy(['w|L-1', 'w|L-2'], TODAY), TODAY);
    expect(fresh).toEqual([]);
    expect(notified).toEqual({ 'w|L-1': '2026-10-24', 'w|L-2': '2026-10-24' });
  });
});
