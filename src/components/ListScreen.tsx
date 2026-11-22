import { useMemo, useState } from 'preact/hooks';
import type { DataFile, ListItem } from '../lib/types';
import { StoreBadge } from './StoreBadge';
import { euro, isoDay } from '../lib/offers';
import { itemFromOffer, lineTotal, listStatus, qtyOf, type ListStatus } from '../lib/list';
import { bestTier, priceAt, tierLabel } from '../lib/tiers';
import { imageCors } from '../lib/images';
import { Icon } from './Icon';

function Thumb({ src }: { src: string | null | undefined }) {
  const [broken, setBroken] = useState(false);
  return (
    <span class="lthumb">
      {src && !broken ? (
        <img src={src} crossorigin={imageCors(src)} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <Icon name="bag" size={20} stroke={1.6} />
      )}
    </span>
  );
}

export function ListScreen({
  data,
  items,
  setItems,
  onShare,
  onRemove,
  onClearDone,
}: {
  data: DataFile | undefined;
  items: ListItem[];
  setItems: (fn: (prev: ListItem[]) => ListItem[]) => void;
  onShare: () => void;
  onRemove: (it: ListItem) => void;
  onClearDone: () => void;
}) {
  const stores = data?.stores ?? [];
  // Older list items were saved without a photo; take it from today's offers.
  const imageOf = (it: ListItem) => it.image ?? data?.offers.find((o) => o.id === it.id)?.image ?? null;
  // Items from shared links or older versions don't carry quantity prices.
  const withTiers = (it: ListItem): ListItem => {
    if (it.tiers || !data) return it;
    const tiers = data.offers.find((o) => o.id === it.id)?.tiers;
    return tiers ? { ...it, tiers } : it;
  };
  const byStore = new Map<string, ListItem[]>();
  for (const it of items.map(withTiers)) byStore.set(it.store, [...(byStore.get(it.store) ?? []), it]);
  const today = isoDay();
  const status = useMemo(
    () => new Map<string, ListStatus>(data ? items.map((it) => [it.id, listStatus(it, data.offers, today)]) : []),
    [items, data, today],
  );
  const expired = (it: ListItem) => !!status.get(it.id)?.expired;
  // Expired promos don't count: their price is no longer what you'd pay.
  const sum = (list: ListItem[]) => list.reduce((s, i) => s + (expired(i) ? 0 : lineTotal(i)), 0);
  const done = items.map(withTiers).filter((i) => i.done);
  const live = items.filter((i) => !expired(i));
  const gone = items.length - live.length;
  const applyUpdate = (it: ListItem, o: NonNullable<ListStatus['update']>) =>
    setItems((prev) =>
      prev.some((x) => x.id === o.id && x.id !== it.id)
        ? prev.filter((x) => x.id !== it.id)
        : prev.map((x) => (x.id === it.id ? { ...itemFromOffer(o, x.done), ...(x.qty ? { qty: x.qty } : {}) } : x)),
    );

  const setQty = (it: ListItem, qty: number) =>
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, qty: Math.max(1, Math.min(999, qty)) } : x)));

  return (
    <>
      <header class="top">
        <div class="brandrow">
          <h1 class="title grow">Списък</h1>
          {done.length ? (
            <button class="iconbtn round" style={{ marginRight: '8px' }} aria-label={`Махни отметнатите (${done.length})`} onClick={onClearDone}>
              <Icon name="trash" size={18} />
              <span class="corner">{done.length}</span>
            </button>
          ) : null}
          {items.length ? (
            <button class="iconbtn round" aria-label="Сподели списъка" onClick={onShare}>
              <Icon name="share" size={18} />
            </button>
          ) : null}
        </div>
      </header>
      <main class="content stack">
        {items.length === 0 ? (
          <div class="empty">
            <strong>Списъкът е празен</strong>
            Натисни количката на някоя оферта, за да я добавиш тук.
          </div>
        ) : (
          <>
            {[...byStore.entries()].map(([storeId, list]) => {
              const store = stores.find((s) => s.id === storeId);
              return (
                <section class="panel lpanel" key={storeId}>
                  <div class="row">
                    <StoreBadge store={store} id={storeId} size={20} />
                    <strong class="grow">{store?.name ?? storeId}</strong>
                    <span class="muted small">{euro(sum(list))}</span>
                  </div>
                  <div>
                    {list.map((it) => {
                      const st = status.get(it.id);
                      const qty = qtyOf(it);
                      const each = priceAt(it.price, it.tiers, qty);
                      // The next quantity that would make each piece cheaper.
                      const next = it.tiers?.find((t) => t.min > qty && t.price < each);
                      const best = bestTier(it.tiers);
                      return (
                        <div class={`listrow${it.done ? ' done' : ''}${st?.expired ? ' expired' : ''}`} key={it.id}>
                          <label class="row grow" style={{ gap: '10px', minHeight: '56px' }}>
                            <input
                              type="checkbox"
                              checked={it.done}
                              onChange={() => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                            />
                            <Thumb src={imageOf(it)} />
                            <span class="grow stack" style={{ gap: '3px', minWidth: 0 }}>
                              <span class="lname">{it.name}</span>
                              <span class="lqty">
                                <button
                                  class="qbtn"
                                  aria-label={`По-малко ${it.name}`}
                                  disabled={qty <= 1}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setQty(it, qty - 1);
                                  }}
                                >
                                  −
                                </button>
                                <span class="qn" aria-label="Брой">
                                  {qty}
                                </span>
                                <button
                                  class="qbtn"
                                  aria-label={`Още ${it.name}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setQty(it, qty + 1);
                                  }}
                                >
                                  +
                                </button>
                                {qty > 1 ? <span class="muted small">× {euro(each)}</span> : null}
                                {next ? (
                                  <button
                                    class="tierhint"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setQty(it, next.min);
                                    }}
                                  >
                                    {tierLabel(next)}
                                  </button>
                                ) : best && qty >= best.min ? (
                                  <span class="tierok">цена от {best.min} бр.</span>
                                ) : null}
                              </span>
                              {st?.expired ? <span class="lstate">Промоцията изтече</span> : null}
                              {st?.update ? (
                                <button
                                  class="lupdate"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    applyUpdate(it, st.update!);
                                  }}
                                >
                                  {st.expired ? 'Пак в промоция' : 'Нова цена'} {euro(st.update.price)} · Обнови
                                </button>
                              ) : null}
                            </span>
                            <strong class="lprice">{euro(lineTotal(it))}</strong>
                          </label>
                          <button class="iconbtn ghost remove" aria-label={`Махни ${it.name}`} onClick={() => onRemove(it)}>
                            <Icon name="close" size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <section class="panel totals" aria-live="polite">
              <div class="stack" style={{ gap: '2px' }}>
                <span class="muted small">
                  Досега · {done.length} от {items.length}
                </span>
                <span class="sofar">{euro(sum(done))}</span>
                {gone ? (
                  <span class="muted small">
                    {gone} {gone === 1 ? 'изтекла промоция не е включена' : 'изтекли промоции не са включени'}
                  </span>
                ) : null}
              </div>
              <div class="stack" style={{ gap: '2px', alignItems: 'flex-end' }}>
                <span class="muted small">Общо</span>
                <span class="grand">{euro(sum(items.map(withTiers)))}</span>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
