import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { listLink, parseIncoming, searchLink, shareOrCopy } from '../src/lib/share';

beforeAll(() => {
  (globalThis as unknown as { location: object }).location = { origin: 'https://livanov.github.io', pathname: '/dealer/' };
});
const hashOf = (url: string) => url.slice(url.indexOf('#'));

describe('share links', () => {
  it('round-trips a search with filters, sort and grouping', () => {
    const search = {
      q: 'кисело мляко',
      filters: { stores: ['lidl', 'billa'], cats: ['dairy'], validity: 'all' as const, minPct: 25 },
      sort: 'relevance' as const,
      group: 'store' as const,
    };
    const url = searchLink(search);
    expect(url.startsWith('https://livanov.github.io/dealer/#/offers?')).toBe(true);
    expect(parseIncoming(hashOf(url))).toEqual({ kind: 'search', search });
  });

  it('round-trips a shopping list with Cyrillic names', () => {
    const items = [
      { id: 'K-1', store: 'kaufland', name: 'Краве масло „Пилос“', pack: '250 г', price: 1.59, to: '2026-10-11', done: false },
      { id: 'L-2', store: 'lidl', name: 'Скир', pack: '', price: 0.89, to: null, done: false },
    ];
    expect(parseIncoming(hashOf(listLink(items)))).toEqual({ kind: 'list', items });
  });

  it('reads an offer link and ignores junk', () => {
    expect(parseIncoming('#/offers?o=K-20982502')).toEqual({ kind: 'offer', id: 'K-20982502' });
    expect(parseIncoming('#/list?l=%%%not-base64')).toBeNull();
    expect(parseIncoming('#/offers')).toBeNull();
    expect(parseIncoming('#/offers?s=1&sort=evil&m=999')).toMatchObject({ search: { sort: 'relevance', filters: { minPct: 90 } } });
  });
});

describe('shareOrCopy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats a dismissed share sheet as cancelled, without copying', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError')),
      clipboard: { writeText },
    });
    expect(await shareOrCopy({ title: 'Скир', url: 'https://livanov.github.io/dealer/' })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });
});
