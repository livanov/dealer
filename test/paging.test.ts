import { describe, expect, it } from 'vitest';
import { pageGroups, type Group } from '../src/lib/offers';
import type { Offer } from '../src/lib/types';

const PAGE = 48;
const group = (key: string, size: number): Group => ({
  key,
  title: key,
  items: Array.from({ length: size }, (_, i) => ({ id: `${key}-${i}` }) as Offer),
});
// Today's offers per store under the default filters.
const stores = [group('kaufland', 871), group('lidl', 610), group('billa', 405)];

/** What the sentinel does while it stays on screen: add a page as long as there's more. */
function scrollToEnd(groups: Group[], isClosed: (g: Group) => boolean) {
  let limit = PAGE;
  while (pageGroups(groups, isClosed, limit).more) limit += PAGE;
  return limit;
}

describe('pageGroups', () => {
  it('stops paging when the remaining offers are in collapsed groups', () => {
    expect(scrollToEnd(stores, () => true)).toBe(48);
    expect(scrollToEnd(stores, (g) => g.key !== 'billa')).toBe(432);
  });

  it('fills open groups in order and skips collapsed ones', () => {
    const groups = [group('a', 30), group('b', 100), group('c', 30), group('d', 10)];
    const page = pageGroups(groups, (g) => g.key === 'b', PAGE);
    expect(page.shown.map((p) => [p.group.key, p.closed, p.items.length, p.before])).toEqual([
      ['a', false, 30, 0],
      ['b', true, 0, 30],
      ['c', false, 18, 30],
    ]);
    expect(page.more).toBe(true);
  });
});
