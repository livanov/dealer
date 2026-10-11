import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Counts, DataFile, InboxItem, ListItem, Offer, Watch } from './lib/types';
import { euro, isoDay, orderCategories, whenLabel } from './lib/offers';
import { idbGet } from './lib/idb';
import { alertBody, alertFor, getCachedData, getCounts, getInbox, getWatches, refresh, saveInbox, saveWatches, watchMatches } from './lib/watch';
import { idbSet } from './lib/idb';
import { useApplyTheme, useCatOrder, useFilters, useGroup, useList, useSort, useStored, useTheme } from './lib/prefs';
import { backgroundStatus, disableBackground, enableAlerts, permission, showNotification, type Background } from './lib/alerts';
import { OffersScreen } from './components/OffersScreen';
import { OfferDetail } from './components/OfferDetail';
import { CardMenu, HideSheet } from './components/CardMenu';
import { CategoryOrderSheet } from './components/CategoryOrderSheet';
import { ImportListSheet } from './components/ImportListSheet';
import { listLink, offerLink, offerText, parseIncoming, searchLink, shareOrCopy, type Incoming } from './lib/share';
import { WatchEditor } from './components/WatchEditor';
import { WatchScreen } from './components/WatchScreen';
import { ListScreen } from './components/ListScreen';
import { InboxScreen } from './components/InboxScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { itemFromOffer } from './lib/list';
import { Icon, type IconName } from './components/Icon';
import { useInstall } from './lib/install';
import { piecePrice } from './lib/units';
import { InstallCard } from './components/InstallCard';

type Route = 'offers' | 'watch' | 'inbox' | 'list' | 'settings';
// Bottom menu. "watch" (followed products) lives inside the Известия tab.
const ROUTES: [Route, string, IconName][] = [
  ['offers', 'Оферти', 'tag'],
  ['list', 'Списък', 'cart'],
  ['inbox', 'Следя', 'eye'],
  ['settings', 'Настройки', 'gear'],
];
const ALL_ROUTES: Route[] = ['offers', 'watch', 'inbox', 'list', 'settings'];
const routeFromHash = (): Route => {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ALL_ROUTES.includes(r) ? r : 'offers';
};

const DATA_URL = new URL('data/offers.json', document.baseURI).href;

const newWatch = (term = ''): Watch => ({
  id: Math.random().toString(36).slice(2, 10),
  term,
  maxPrice: null,
  minPct: null,
  maxUnit: null,
  unitKind: 'kg',
  exclude: [],
  createdAt: Date.now(),
});

/** A sensible starting search term from an offer's name. */
const termFrom = (o: Offer) =>
  o.name
    .replace(/\s*(различни|избрани)\s+(видове|вкусове|цветове|модели)\.?$/i, '')
    .replace(/\s*\d+([.,]\d+)?\s*(г|кг|мл|л|g|kg|ml|l)\b.*$/i, '')
    .trim();

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [query, setQuery] = useState('');
  const [incoming, setIncoming] = useState<Incoming>(() => parseIncoming(location.hash));
  const [importItems, setImportItems] = useState<ListItem[] | null>(null);
  const [data, setData] = useState<DataFile | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [detail, setDetail] = useState<Offer | null>(null);
  const [editing, setEditing] = useState<{ watch: Watch; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [menuFor, setMenuFor] = useState<Offer | null>(null);
  const [hideFor, setHideFor] = useState<Offer | null>(null);
  const [perm, setPerm] = useState(permission());
  const [background, setBackground] = useState<Background>('unsupported');

  const [theme, setTheme] = useTheme();
  const [filters, setFilters] = useFilters();
  const [sort, setSort] = useSort();
  const [group, setGroup] = useGroup();
  const [list, setList] = useList();
  const [catOrder, setCatOrder] = useCatOrder();
  const [hiddenStores, setHiddenStores] = useStored<string[]>('hiddenStores', []);
  const [counts, setCounts] = useState<Counts>({});
  // The background check (service worker) can't read localStorage; mirror to IndexedDB.
  useEffect(() => {
    idbSet('hiddenStores', hiddenStores);
  }, [hiddenStores]);
  const setCount = async (id: string, n: number | null) => {
    const next = { ...counts };
    if (n && n > 0) next[id] = Math.round(n);
    else delete next[id];
    setCounts(next);
    await idbSet('counts', next);
  };
  const [orderOpen, setOrderOpen] = useState<null | 'sort' | 'settings'>(null);
  const [alertsWanted, setAlertsWanted] = useStored('alerts', false);
  const alertsOn = alertsWanted && perm === 'granted';
  useApplyTheme(theme);
  const app = useInstall();

  const today = isoDay();
  // What the screens show: everything except the stores the user turned off.
  const shown = useMemo<DataFile | undefined>(
    () =>
      data && hiddenStores.length
        ? { ...data, stores: data.stores.filter((s) => !hiddenStores.includes(s.id)), offers: data.offers.filter((o) => !hiddenStores.includes(o.store)) }
        : data,
    [data, hiddenStores],
  );
  const matchCtx = useMemo(() => ({ counts, hiddenStores }), [counts, hiddenStores]);
  const categories = useMemo(() => (data ? orderCategories(data.categories, catOrder) : []), [data, catOrder]);
  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of data?.offers ?? []) c[o.cat] = (c[o.cat] ?? 0) + 1;
    return c;
  }, [data]);

  const toastTimer = useRef<number>();
  const say = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 2600);
  }, []);

  const doRefresh = useCallback(
    async (manual = false) => {
      setRefreshing(true);
      const before = (await getCachedData())?.generatedAt;
      const fresh = await refresh(DATA_URL, alertsOn ? showNotification : null);
      if (fresh) setData(fresh);
      setInbox(await getInbox());
      setCheckedAt((await idbGet<number>('checkedAt')) ?? null);
      setRefreshing(false);
      setLoading(false);
      if (manual) say(!fresh ? 'Няма връзка – показвам запазените оферти' : fresh.generatedAt !== before ? 'Офертите са обновени' : 'Няма нови оферти');
    },
    [alertsOn, say],
  );

  // Show what's stored on the device straight away, then fetch fresh data.
  useEffect(() => {
    (async () => {
      const cached = await getCachedData();
      if (cached) {
        setData(cached);
        setLoading(false);
      }
      setWatches(await getWatches());
      setCounts(await getCounts());
      setInbox(await getInbox());
      setCheckedAt((await idbGet<number>('checkedAt')) ?? null);
      setBackground(await backgroundStatus());
    })();
  }, []);
  const lastCheck = useRef(0);
  const refreshRef = useRef(doRefresh);
  refreshRef.current = doRefresh;
  useEffect(() => {
    lastCheck.current = Date.now();
    refreshRef.current();
    // Re-check when the app comes back to the foreground after a while.
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > 30 * 60 * 1000) {
        lastCheck.current = Date.now();
        refreshRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      const inc = parseIncoming(location.hash);
      if (inc) setIncoming(inc);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => window.scrollTo({ top: 0 }), [route]);

  // Open shared links: an offer, a search, or a shopping list.
  useEffect(() => {
    if (!incoming || (incoming.kind === 'offer' && !data)) return;
    const clean = (r: Route) => history.replaceState(history.state, '', `${location.pathname}#/${r}`);
    if (incoming.kind === 'offer') {
      const o = data!.offers.find((x) => x.id === incoming.id);
      if (o) setDetail(o);
      else say('Тази оферта вече не е активна');
      clean('offers');
    } else if (incoming.kind === 'search') {
      const before = { query, filters, sort, group };
      const s = incoming.search;
      setQuery(s.q);
      setFilters({ ...filters, ...s.filters });
      setSort(s.sort);
      setGroup(s.group);
      say('Отворено е споделено търсене', () => {
        setQuery(before.query);
        setFilters(before.filters);
        setSort(before.sort);
        setGroup(before.group);
      });
      clean('offers');
    } else {
      setImportItems(incoming.items);
      clean('list');
    }
    setIncoming(null);
  }, [incoming, data]);

  const shared = (res: 'shared' | 'copied' | 'failed') => {
    if (res === 'copied') say('Линкът е копиран');
    else if (res === 'failed') say('Не успях да споделя');
  };
  const storeName = (id: string) => data?.stores.find((s) => s.id === id)?.name ?? id;
  const shareOffer = async (o: Offer) =>
    shared(await shareOrCopy({ title: o.name, text: offerText(o, storeName(o.store), whenLabel(o, today)?.text), url: offerLink(o) }));
  const shareSearch = async (q: string) => {
    const bits = [q.trim() && `„${q.trim()}“`, ...filters.stores.map(storeName)].filter(Boolean).join(', ');
    shared(
      await shareOrCopy({
        title: 'Оферти в dealer',
        text: bits ? `Виж офертите за ${bits}` : 'Виж тези оферти',
        url: searchLink({ q, filters, sort, group }),
      }),
    );
  };
  const shareList = async () => {
    const text = ['Моят списък за пазаруване:', ...list.map((i) => `• ${i.name}${i.pack ? ` (${i.pack})` : ''} – ${euro(i.price)} · ${storeName(i.store)}`)].join('\n');
    shared(await shareOrCopy({ title: 'Списък за пазаруване', text, url: listLink(list) }));
  };

  const updateWatches = async (next: Watch[]) => {
    setWatches(next);
    await saveWatches(next);
  };

  const turnOnAlerts = async () => {
    const res = await enableAlerts();
    setPerm(res.permission);
    setBackground(res.background);
    if (res.permission === 'granted') {
      setAlertsWanted(true);
      say(res.background === 'on' ? 'Известията са включени, вкл. във фонов режим' : 'Известията са включени');
    } else if (res.permission === 'denied') say('Известията са блокирани от браузъра');
    else if (res.permission === 'unsupported') say('Браузърът не поддържа известия');
  };
  // A real system notification, built like the background ones: from a followed
  // product that's on sale now, or else the biggest discount of the day.
  const testAlert = async () => {
    let p = perm;
    if (p !== 'granted') p = (await enableAlerts()).permission;
    setPerm(p);
    if (p !== 'granted') return say(p === 'denied' ? 'Известията са блокирани от браузъра' : 'Браузърът не поддържа известия');
    if (!data || !shown) return;
    const today = isoDay();
    const hit = watches
      .map((w) => ({ w, hits: shown.offers.filter((o) => watchMatches(w, o, today, matchCtx)) }))
      .find((x) => x.hits.length);
    const top = shown.offers.slice().sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
    if (!hit && !top) return;
    const [title, opts] = hit
      ? alertFor(hit.w.term, alertBody(hit.hits, data, today), hit.w.id)
      : alertFor(top.name.split(' ').slice(0, 3).join(' '), alertBody([top], data, today), 'test');
    try {
      await showNotification(title, { ...opts, tag: 'test' });
      say('Пратено – виж известията на телефона');
    } catch {
      say('Неуспешно изпращане на известие');
    }
  };
  const installApp = async () => {
    if (await app.install()) say('Готово – отвори dealer от началния екран');
  };
  const toggleAlerts = async (on: boolean) => {
    if (on) return turnOnAlerts();
    setAlertsWanted(false);
    await disableBackground();
    setBackground(await backgroundStatus());
  };


  const storeOf = (o: Offer) => data?.stores.find((s) => s.id === o.store);
  const inList = (o: Offer) => list.some((i) => i.id === o.id);
  const listIds = useMemo(() => new Set(list.map((i) => i.id)), [list]);
  const isInList = useCallback((o: Offer) => listIds.has(o.id), [listIds]);
  const toggleList = (o: Offer) => {
    if (inList(o)) {
      const before = list;
      setList((prev) => prev.filter((i) => i.id !== o.id));
      say('Махнато от списъка', () => setList(before));
    } else {
      setList((prev) => [...prev, itemFromOffer(o)]);
      say('Добавено в списъка');
    }
  };

  // Followed products that have at least one offer right now.
  const watchesOnSale = useMemo(
    () => (data ? watches.filter((w) => data.offers.some((o) => watchMatches(w, o, today, matchCtx))).length : 0),
    [data, watches, today, matchCtx],
  );
  const unread = inbox.filter((i) => !i.read).length;
  const badge = (key: Route) => (key === 'inbox' ? watchesOnSale : key === 'list' ? list.filter((i) => !i.done).length : 0);

  const openWatchFor = (o: Offer) => {
    setDetail(null);
    // Start with the unit this kind of product is compared by: pieces for capsules etc.
    const unitKind = piecePrice(o, counts) ? 'pc' : (o.unitOf ?? 'kg');
    setEditing({ watch: { ...newWatch(termFrom(o)), unitKind }, isNew: true });
  };

  return (
    <div class="app">
      {route === 'offers' ? (
        data ? (
          <OffersScreen
            data={shown!}
            counts={counts}
            today={today}
            filters={filters}
            setFilters={setFilters}
            sort={sort}
            setSort={setSort}
            group={group}
            setGroup={setGroup}
            isInList={isInList}
            onOpen={setDetail}
            onCart={toggleList}
            onMenu={setMenuFor}
            categories={categories}
            onEditOrder={() => setOrderOpen('sort')}
            query={query}
            setQuery={setQuery}
            onShareSearch={shareSearch}
          />
        ) : (
          <div class="loading" style={{ paddingTop: '30vh' }}>
            {loading ? 'Зареждам офертите…' : 'Не успях да заредя офертите. Провери връзката и опитай пак.'}
            {!loading ? (
              <p>
                <button class="secondary" onClick={() => doRefresh(true)}>
                  Опитай пак
                </button>
              </p>
            ) : null}
          </div>
        )
      ) : null}
      {route === 'watch' || route === 'inbox' ? (
        <>
          <header class="top">
            <div class="brandrow">
              <h1 class="title">Следя</h1>
              <button class="filterbtn" onClick={() => setEditing({ watch: newWatch(), isNew: true })} style={{ height: '40px', padding: '0 14px' }}>
                <Icon name="plus" size={16} stroke={2.6} /> Следи
              </button>
            </div>
            <div class="seg" role="tablist" aria-label="Известия">
              <a role="tab" class="segtab" href="#/inbox" aria-selected={route === 'inbox'}>
                Известия{unread ? ` (${unread})` : ''}
              </a>
              <a role="tab" class="segtab" href="#/watch" aria-selected={route === 'watch'}>
                Следени{watches.length ? ` (${watchesOnSale}/${watches.length})` : ''}
              </a>
            </div>
          </header>
          {!app.installed ? (
            <div style={{ padding: '0 16px 10px' }}>
              <InstallCard canPrompt={app.canPrompt} onInstall={installApp} />
            </div>
          ) : !alertsOn ? (
            <div class="banner">
              <Icon name="bell" />
              <span class="grow">Включи известията, за да разбираш за нови оферти, без да отваряш приложението.</span>
              <button class="textbtn" onClick={turnOnAlerts}>
                Включи
              </button>
            </div>
          ) : null}
          {route === 'watch' ? (
            <WatchScreen
              data={shown}
              ctx={matchCtx}
              watches={watches}
              today={today}
              onNew={() => setEditing({ watch: newWatch(), isNew: true })}
              onEdit={(w) => setEditing({ watch: w, isNew: false })}
              onOpen={setDetail}
            />
          ) : (
            <InboxScreen
              items={inbox}
              onOpen={async (it) => {
                const next = inbox.map((x) => (x.id === it.id ? { ...x, read: true } : x));
                setInbox(next);
                await saveInbox(next);
                location.hash = '#/watch';
              }}
              onMarkAllRead={async () => {
                const next = inbox.map((x) => ({ ...x, read: true }));
                setInbox(next);
                await saveInbox(next);
              }}
            />
          )}
        </>
      ) : null}
      {route === 'list' ? <ListScreen
          data={data}
          items={list}
          setItems={setList}
          onShare={shareList}
          onRemove={(it) => {
            const before = list;
            setList((prev) => prev.filter((x) => x.id !== it.id));
            say(`Махнато: ${it.name}`, () => setList(before));
          }}
          onClearDone={() => {
            const before = list;
            const n = list.filter((i) => i.done).length;
            setList((prev) => prev.filter((i) => !i.done));
            say(`Махнати ${n} отметнати`, () => setList(before));
          }}
        /> : null}
      {route === 'settings' ? (
        <SettingsScreen
          data={data}
          theme={theme}
          setTheme={setTheme}
          alertsOn={alertsOn}
          perm={perm}
          background={background}
          onToggleAlerts={toggleAlerts}
          onTestAlert={testAlert}
          checkedAt={checkedAt}
          refreshing={refreshing}
          onRefresh={() => doRefresh(true)}
          installed={app.installed}
          canPrompt={app.canPrompt}
          onInstall={installApp}
          hiddenStores={hiddenStores}
          setHiddenStores={setHiddenStores}
        />
      ) : null}

      <nav class="nav" aria-label="Основна навигация">
        {ROUTES.map(([key, label, icon]) => (
          <a href={`#/${key}`} aria-current={route === key || (key === 'inbox' && route === 'watch') ? 'page' : undefined}>
            <Icon name={icon} size={22} />
            {label}
            {badge(key) ? <span class="pip">{badge(key)}</span> : null}
          </a>
        ))}
      </nav>

      {detail && data ? (
        <OfferDetail
          offer={detail}
          store={storeOf(detail)}
          category={data.categories.find((c) => c.id === detail.cat)}
          today={today}
          inList={inList(detail)}
          onWatch={() => openWatchFor(detail)}
          onToggleList={() => toggleList(detail)}
          onShare={() => shareOffer(detail)}
          onClose={() => setDetail(null)}
          counts={counts}
          onSetCount={async (n) => {
            await setCount(detail.id, n);
            say(n ? `Запазено: ${n} бр. в опаковката` : 'Броят е изчистен');
          }}
          allOffers={shown?.offers ?? []}
          stores={data.stores}
          onOpenOffer={setDetail}
        />
      ) : null}
      {importItems ? (
        <ImportListSheet
          items={importItems}
          mine={list}
          stores={data?.stores ?? []}
          onClose={() => setImportItems(null)}
          onAdd={(items) => {
            setList((prev) => [...prev, ...items.filter((i) => !prev.some((p) => p.id === i.id))]);
            setImportItems(null);
            location.hash = '#/list';
            say(`Добавени ${items.length} в списъка`);
          }}
        />
      ) : null}
      {orderOpen && data ? (
        <CategoryOrderSheet
          categories={categories}
          defaults={data.categories}
          counts={catCounts}
          onClose={() => setOrderOpen(null)}
          onSave={(ids) => {
            setCatOrder(ids);
            // Opened from the sort menu: the user wants to sort this way.
            if (orderOpen === 'sort') setSort('relevance');
            setOrderOpen(null);
            say('Редът на категориите е запазен');
          }}
        />
      ) : null}
      {menuFor ? (
        <CardMenu
          offer={menuFor}
          store={storeOf(menuFor)}
          inList={inList(menuFor)}
          onHide={() => {
            setMenuFor(null);
            setHideFor(menuFor);
          }}
          onWatch={() => {
            setMenuFor(null);
            openWatchFor(menuFor);
          }}
          onToggleList={() => {
            toggleList(menuFor);
            setMenuFor(null);
          }}
          onOpen={() => {
            setMenuFor(null);
            setDetail(menuFor);
          }}
          onShare={() => {
            setMenuFor(null);
            shareOffer(menuFor);
          }}
          onClose={() => setMenuFor(null)}
        />
      ) : null}
      {hideFor && data ? (
        <HideSheet
          offer={hideFor}
          offers={data.offers}
          onClose={() => setHideFor(null)}
          onHide={(term) => {
            const before = filters;
            if (!filters.hide.some((h) => h.toLowerCase() === term.toLowerCase())) setFilters({ ...filters, hide: [...filters.hide, term] });
            setHideFor(null);
            say(`Скрито: „${term}“`, () => setFilters(before));
          }}
        />
      ) : null}
      {editing ? (
        <WatchEditor
          initial={editing.watch}
          offers={shown?.offers ?? []}
          today={today}
          ctx={matchCtx}
          onClose={() => setEditing(null)}
          onDelete={
            editing.isNew
              ? undefined
              : async () => {
                  await updateWatches(watches.filter((w) => w.id !== editing.watch.id));
                  setEditing(null);
                }
          }
          onSave={async (w) => {
            const next = editing.isNew ? [w, ...watches] : watches.map((x) => (x.id === w.id ? w : x));
            await updateWatches(next);
            setEditing(null);
            if (editing.isNew) {
              say(`Следиш „${w.term}“`);
              if (!alertsOn && perm !== 'denied') location.hash = '#/watch';
            }
          }}
        />
      ) : null}
      {toast ? (
        <div class="toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo ? (
            <button
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Отмени
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
