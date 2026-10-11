import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, activeFilterCount, clearFilters } from '../src/lib/prefs';
import type { Filters } from '../src/lib/types';

describe('clearing filters', () => {
  const f: Filters = { stores: ['lidl'], cats: ['dairy'], validity: 'all', minPct: 25, hide: ['моторно', 'ziaja'] };
  it('resets everything but the hidden words', () => {
    expect(clearFilters(f)).toEqual({ ...DEFAULT_FILTERS, hide: ['моторно', 'ziaja'] });
  });
  it('leaves the hidden words as the only active filter', () => {
    expect(activeFilterCount(clearFilters(f))).toBe(1);
    expect(activeFilterCount(clearFilters({ ...f, hide: [] }))).toBe(0);
  });
});
