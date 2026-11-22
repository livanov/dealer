import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Category, Counts, Offer, Store } from '../lib/types';
import { fold } from '../lib/text';
import { isExpired, searchKey } from '../lib/offers';
import { piecePrice, unitPriceIn, unitText, weightPrice, type UnitKind } from '../lib/units';
import { StoreBadge } from './StoreBadge';
import { euro, whenLabel } from '../lib/offers';
import { Sheet } from './Sheet';
import { OfferImage } from './OfferCard';
import { Icon } from './Icon';

const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export function OfferDetail({
  offer: o,
  store,
  category,
  today,
  inList,
  onWatch,
  onToggleList,
  onShare,
  onClose,
  counts,
  onSetCount,
  allOffers,
  stores,
  onOpenOffer,
}: {
  offer: Offer;
  store: Store | undefined;
  category: Category | undefined;
  today: string;
  inList: boolean;
  onWatch: () => void;
  onToggleList: () => void;
  onShare: () => void;
  onClose: () => void;
  counts: Counts;
  onSetCount: (n: number | null) => void;
  allOffers: Offer[];
  stores: Store[];
  onOpenOffer: (o: Offer) => void;
}) {
  const pp = piecePrice(o, counts);
  const wp = weightPrice(o);
  const [countText, setCountText] = useState(counts[o.id] ? String(counts[o.id]) : '');
  useEffect(() => setCountText(counts[o.id] ? String(counts[o.id]) : ''), [o.id]);
  // Similar offers: same first words of the name, same category.
  const candidates = useMemo(() => {
    const words = fold(o.name).split(' ').slice(0, 2).join(' ');
    if (!words) return [];
    return allOffers.filter((x) => x.cat === o.cat && !isExpired(x, today) && searchKey(x).includes(words));
  }, [o, allOffers, today]);
  // Compare in this offer's own unit: per piece when it has a count, else per
  // kg/l; per piece only as a last resort, when similar offers have counts.
  const kind: UnitKind | null = pp ? 'pc' : wp?.kind ?? (candidates.some((x) => piecePrice(x, counts)) ? 'pc' : null);
  // Sold by weight/volume (price per kg/l known) with no piece count: pieces
  // mean nothing there, so no piece price and no way to enter a count.
  const showCount = !!pp || !wp;

  const similar = useMemo(() => {
    if (!kind) return [];
    return candidates
      .map((x) => ({ x, u: unitPriceIn(x, kind, counts) }))
      .sort((a, b) => (a.u ? a.u.value : Infinity) - (b.u ? b.u.value : Infinity))
      .slice(0, 10);
  }, [candidates, counts, kind]);
  const cheapest = similar.find((s) => s.u)?.u?.value;
  const when = whenLabel(o, today);
  const validity =
    o.from && o.to ? `${dmy(o.from)} – ${dmy(o.to)}` : o.from ? `от ${dmy(o.from)}` : o.to ? `до ${dmy(o.to)}` : 'не е посочена';
  return (
    <Sheet title={store?.name ?? o.store} onClose={onClose} action={
      <button class="iconbtn ghost" aria-label="Затвори" onClick={onClose}>
        <Icon name="close" />
      </button>
    }>
      <div class="detail stack">
        <div style={{ position: 'relative' }}>
          <OfferImage offer={o} class="detail-media" />
          {o.pct ? <span class="badge" style={{ fontSize: '18px' }}>−{o.pct}%</span> : null}
        </div>
        <div class="stack" style={{ gap: '4px' }}>
          {o.brand ? <div class="brand">{o.brand}</div> : null}
          <h2>{o.name}</h2>
          {o.desc ? <p class="desc">{o.desc}</p> : null}
        </div>
        <div class="bigprice">
          <span class="price">{euro(o.price)}</span>
          {o.old ? <span class="old" style={{ fontSize: '16px' }}>{euro(o.old)}</span> : null}
          {when ? <span class={`tone-${when.tone}`} style={{ fontSize: '14px' }}>{when.text}</span> : null}
        </div>
        <dl class="facts">
          <dt>Магазин</dt>
          <dd class="row" style={{ gap: '6px' }}>
            <StoreBadge store={store} id={o.store} />
            {store?.name ?? o.store}
          </dd>
          {o.pack ? (
            <>
              <dt>Разфасовка</dt>
              <dd>{o.pack}</dd>
            </>
          ) : null}
          {pp ? (
            <>
              <dt>Цена за брой</dt>
              <dd>
                <strong>{unitText(pp)}</strong>
                <span class="muted small">
                  {' '}
                  · {pp.count} бр.{pp.user ? ' (въведено от теб)' : pp.est ? ' (прибл., по грамажа)' : ''}
                </span>
              </dd>
            </>
          ) : null}
          {wp ? (
            <>
              <dt>Цена за {wp.kind === 'kg' ? 'кг' : 'л'}</dt>
              <dd>{pp ? unitText(wp) : <strong>{unitText(wp)}</strong>}</dd>
            </>
          ) : null}
          {o.tiers?.length ? (
            <>
              <dt>При количество</dt>
              <dd>
                <table class="tiers">
                  <tbody>
                    <tr>
                      <td>1 бр.</td>
                      <td>{euro(o.price)}</td>
                      <td class="muted">{wp ? unitText(wp) : ''}</td>
                    </tr>
                    {o.tiers.map((t) => (
                      <tr key={t.min}>
                        <td>от {t.min} бр.</td>
                        <td>
                          <strong>{euro(t.price)}</strong> <span class="tone-next">−{Math.round((1 - t.price / o.price) * 100)}%</span>
                        </td>
                        <td class="muted">{wp ? unitText({ ...wp, value: (wp.value * t.price) / o.price }) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <span class="muted small">Цена на брой при покупка на поне толкова.</span>
              </dd>
            </>
          ) : null}
          {!pp && !wp ? (
            <>
              <dt>Цена за брой</dt>
              <dd class="muted">неизвестна</dd>
            </>
          ) : null}
          <dt>Валидност</dt>
          <dd>{validity}</dd>
          {o.store === 'metro' ? (
            <>
              <dt>Условия</dt>
              <dd class="muted">С клиентска карта METRO. Цени с ДДС в METRO София – Цариградско шосе; в другите магазини може да се различават.</dd>
            </>
          ) : null}
          {category ? (
            <>
              <dt>Категория</dt>
              <dd>{category.label}</dd>
            </>
          ) : null}
        </dl>
        {showCount ? <div class="countedit">
          <label class="field" style={{ flex: 1 }}>
            <span class="hint">Брой в опаковката (капсули, пранета, ролки…)</span>
            <input
              inputMode="numeric"
              value={countText}
              placeholder={o.pcs ? `${o.pcs}${o.pcsEst ? ' (прибл.)' : ''}` : 'напр. 30'}
              onInput={(e) => setCountText(e.currentTarget.value.replace(/[^\d]/g, ''))}
            />
          </label>
          <button
            class="secondary"
            style={{ height: '46px', alignSelf: 'flex-end' }}
            onClick={() => onSetCount(countText ? Number(countText) : null)}
          >
            {countText ? 'Запази' : counts[o.id] ? 'Изчисти' : 'Запази'}
          </button>
        </div> : null}
        {similar.length > 1 ? (
          <section class="compare">
            <h3 class="label">Сравни по цена за {kind === 'pc' ? 'брой' : kind === 'kg' ? 'кг' : 'л'}</h3>
            {similar.map(({ x, u }) => (
              <button class={`cmprow${x.id === o.id ? ' current' : ''}`} onClick={() => x.id !== o.id && onOpenOffer(x)}>
                <StoreBadge store={stores.find((s) => s.id === x.store)} id={x.store} />
                <span class="grow" style={{ minWidth: 0 }}>
                  <span class="cname">
                    {x.brand ? `${x.brand} ` : ''}
                    {x.name}
                  </span>
                  <span class="muted small">
                    {x.pack || '—'} · {euro(x.price)}
                  </span>
                </span>
                <span class={`cunit${u && u.value === cheapest ? ' best' : ''}`}>{u ? unitText(u) : 'няма брой'}</span>
              </button>
            ))}
            {kind === 'pc' ? <p class="hint">Въведи броя в опаковката на офертите без брой, за да ги сравниш и тях.</p> : null}
          </section>
        ) : null}
        <div class="actions">
          <button class="action full" onClick={onWatch}>
            <Icon name="bell" size={18} /> Следи подобни оферти
          </button>
          <button class="action" onClick={onToggleList}>
            <Icon name={inList ? 'cartcheck' : 'cart'} size={18} /> {inList ? 'В списъка' : 'Към списъка'}
          </button>
          <button class="action" onClick={onShare}>
            <Icon name="share" size={18} /> Сподели
          </button>
          {o.url ? (
            <a class="action wide" href={o.url} target="_blank" rel="noopener">
              <Icon name="external" size={18} /> Виж в сайта на {store?.name ?? 'магазина'}
            </a>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
