import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script
import { keepFresh } from '../scripts/fallback.mjs';

const offers = (n: number, to: string | null, tag = 'K') =>
  Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, store: 'kaufland', brand: '', name: `Оферта ${i}`, pack: '', price: 1, from: null, to }));

const now = new Date('2026-10-12T07:15:00Z');
const yesterday = '2026-10-11T06:43:58.923959+00:00';

describe('falling back to the previous build', () => {
  it('falls back when a scrape returns a fraction of the offers', () => {
    expect(keepFresh(offers(20, '2026-10-18'), offers(1700, '2026-10-18'), yesterday, now)).toBe(false);
  });

  it('keeps a scrape with at least half the offers', () => {
    expect(keepFresh(offers(850, '2026-10-18'), offers(1700, '2026-10-18'), yesterday, now)).toBe(true);
    expect(keepFresh(offers(849, '2026-10-18'), offers(1700, '2026-10-18'), yesterday, now)).toBe(false);
  });

  it('does not count previous offers that have ended', () => {
    const previous = [...offers(900, '2026-10-11', 'old'), ...offers(800, '2026-10-18')];
    expect(keepFresh(offers(800, '2026-10-18'), previous, yesterday, now)).toBe(true);
  });

  it('stops falling back once the previous offers are two days old', () => {
    expect(keepFresh(offers(100, null), offers(900, null), '2026-10-10T08:00:00Z', now)).toBe(false);
    expect(keepFresh(offers(100, null), offers(900, null), '2026-10-10T07:00:00Z', now)).toBe(true);
  });

  it('keeps the scrape when there is nothing to compare with', () => {
    expect(keepFresh(offers(20, '2026-10-18'), [], null, now)).toBe(true);
    expect(keepFresh(offers(20, '2026-10-18'), offers(1700, '2026-10-18'), null, now)).toBe(true);
  });
});
