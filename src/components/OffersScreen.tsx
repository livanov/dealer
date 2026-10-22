import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Category, Counts, DataFile, Filters, GroupKey, Offer, SortKey } from '../lib/types';
import { filterOffers, groupOffers, pageGroups, sortOffers } from '../lib/offers';
import { activeFilterCount } from '../lib/prefs';
import { OfferCard } from './OfferCard';
import { StoreBadge } from './StoreBadge';
import { bestUnit, unitText } from '../lib/units';
import { useStored } from '../lib/prefs';
import { FilterSheet } from './FilterSheet';
import { SortMenu, SORTS } from './SortMenu';
import { Icon } from './Icon';

const PAGE = 48;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function OffersScreen({
  data,
  today,
  filters,
  setFilters,
  sort,
  setSort,
  group,
  setGroup,
  isInList,
  onOpen,
  onCart,
  onMenu,
  categories,
  catCounts,
  onEditOrder,
  query,
  setQuery,
  onShareSearch,
  counts,
}: {
  data: DataFile;
  today: string;
  filters: Filters;
  setFilters: (f: Filters) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  group: GroupKey;
  setGroup: (g: GroupKey) => void;
  isInList: (o: Offer) => boolean;
  onOpen: (o: Offer) => void;
  onCart: (o: Offer) => void;
  onMenu: (o: Offer) => void;
  /** Categories in the user's order. */
  categories: Category[];
  catCounts: Record<string, number>;
  onEditOrder: () => void;
  query: string;
  setQuery: (q: string) => void;
  onShareSearch: (q: string) => void;
  counts: Counts;
}) {
  const [collapsed, setCollapsed] = useStored<string[]>('collapsed', []);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(query, 150);

  const results = useMemo(
    () => {
      const rank = Object.fromEntries(categories.map((c, i) => [c.id, i]));
      return sortOffers(filterOffers(data.offers, q, filters, today), sort, rank, counts);
    },
    [data, q, filters, sort, today, categories, counts],
  );
  const groups = useMemo(() => groupOffers(results, group, data.stores, categories, today), [results, group, data, today, categories]);
  const allCollapsed = groups.length > 1 && groups.every((g) => collapsed.includes(`${group}:${g.key}`));

  // Endless list: render a page at a time, add more when the sentinel scrolls into view.
  useEffect(() => setLimit(PAGE), [q, filters, sort, group]);
  const page = pageGroups(groups, (g) => !!g.title && collapsed.includes(`${group}:${g.key}`), limit);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE), {
      rootMargin: '1200px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [page.more, limit]);
  // Page again from the toggled group; the groups above keep what they show, so its heading stays put.
  const toggleGroups = (keys: string[], before: number) => {
    setCollapsed(keys);
    setLimit(before + PAGE);
  };

  const nFilters = activeFilterCount(filters);
  const sortLabel = SORTS.find(([k]) => k === sort)?.[1];
  const sortChanged = sort !== 'relevance' || group !== 'none';
  // Hidden words are personal and not part of a shared search.
  const canShare =
    !!query.trim() || !!filters.stores.length || !!filters.cats.length || filters.validity !== 'now' || filters.minPct > 0 || sortChanged;

  return (
    <>
      <header class="top">
        <div class="searchrow">
          <label class={`search${query ? ' active' : ''}`}>
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              placeholder="Търси…"
              aria-label="Търсене"
              enterKeyHint="search"
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            {query ? (
              <button class="iconbtn ghost" aria-label="Изчисти търсенето" onClick={() => setQuery('')}>
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </label>
          <div class="sortwrap">
            <button
              class={`iconbtn round${sortChanged ? ' changed' : ''}`}
              aria-label={`Подреди: ${sortLabel}${group !== 'none' ? ', с групиране' : ''}`}
              aria-haspopup="menu"
              aria-expanded={showSort}
              onClick={() => setShowSort(true)}
            >
              <Icon name="sort" size={18} stroke={2.2} />
            </button>
            {showSort ? (
              <SortMenu sort={sort} group={group} onSort={setSort} onGroup={setGroup} onEditOrder={onEditOrder} onClose={() => setShowSort(false)} />
            ) : null}
          </div>
          <button
            class={`iconbtn round filter${nFilters ? ' active' : ''}`}
            aria-label={`Филтри${nFilters ? `, ${nFilters} активни` : ''}`}
            onClick={() => setShowFilters(true)}
          >
            <Icon name="filter" size={18} stroke={2.2} />
            {nFilters ? <span class="corner">{nFilters}</span> : null}
          </button>
          {canShare ? (
            <button class="iconbtn round share" aria-label="Сподели това търсене" onClick={() => onShareSearch(query)}>
              <Icon name="share" size={18} stroke={2.2} />
            </button>
          ) : null}
        </div>
        <p class="sr-only" aria-live="polite">
          {results.length} {results.length === 1 ? 'оферта' : 'оферти'}
        </p>
      </header>

      <main class="content">
        {results.length === 0 ? (
          <div class="empty">
            <strong>Няма оферти</strong>
            {q || nFilters ? 'Опитай с друга дума или по-малко филтри.' : 'Данните още не са заредени.'}
          </div>
        ) : (
          <>
          {groups.length > 1 ? (
            <div class="row" style={{ justifyContent: 'flex-end', margin: '-4px 0 4px' }}>
              <button class="textbtn small" onClick={() => toggleGroups(allCollapsed ? [] : groups.map((g) => `${group}:${g.key}`), 0)}>
                {allCollapsed ? 'Разгъни всички' : 'Свий всички'}
              </button>
            </div>
          ) : null}
          {page.shown.map(({ group: g, closed, items, before }) => {
            const ck = `${group}:${g.key}`;
            return (
              <section class="group" key={g.key}>
                {g.title ? (
                  <button
                    class="grouphead"
                    aria-expanded={!closed}
                    onClick={() => toggleGroups(closed ? collapsed.filter((k) => k !== ck) : [...collapsed, ck], before)}
                  >
                    <span class={`chev${closed ? ' closed' : ''}`} aria-hidden="true">
                      <Icon name="chevron" size={16} stroke={2.6} />
                    </span>
                    {group === 'store' ? <StoreBadge store={data.stores.find((s) => s.id === g.key)} id={g.key} size={20} /> : null}
                    <span class="gname">{g.title}</span>
                    <span class="gcount">{g.items.length}</span>
                    <span class="rule" />
                  </button>
                ) : null}
                {closed ? null : (
                <div class="grid">
                  {items.map((o) => (
                    <OfferCard
                      key={o.id}
                      offer={o}
                      store={data.stores.find((s) => s.id === o.store)}
                      today={today}
                      inList={isInList(o)}
                      onOpen={onOpen}
                      onCart={onCart}
                      onMenu={onMenu}
                      unit={unitText(bestUnit(o, counts))}
                    />
                  ))}
                </div>
                )}
              </section>
            );
          })}
          </>
        )}
        {page.more ? <div class="sentinel" ref={sentinel} /> : null}
      </main>

      {showFilters ? (
        <FilterSheet
          initial={filters}
          stores={data.stores}
          cats={categories}
          catCounts={catCounts}
          onApply={(f) => {
            setFilters(f);
            setShowFilters(false);
            window.scrollTo({ top: 0 });
          }}
          onClose={() => setShowFilters(false)}
        />
      ) : null}
    </>
  );
}
