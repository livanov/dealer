import { memo } from 'preact/compat';
import { StoreBadge } from './StoreBadge';
import { useRef, useState } from 'preact/hooks';
import type { Offer, Store } from '../lib/types';
import { euro, whenLabel } from '../lib/offers';
import { imageCors } from '../lib/images';
import { bestTier, tierLabel } from '../lib/tiers';
import { Icon } from './Icon';

export function storeColor(store: Store | undefined) {
  if (!store) return '#888';
  return store.id === 'lidl' ? 'var(--lidl)' : store.color;
}

export function OfferImage({ offer, class: cls }: { offer: Offer; class: string }) {
  const [broken, setBroken] = useState(false);
  if (!offer.image || broken)
    return (
      <div class={`${cls} noimg`}>
        <Icon name="bag" size={36} stroke={1.5} />
      </div>
    );
  return (
    <div class={cls}>
      <img src={offer.image} crossorigin={imageCors(offer.image)} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBroken(true)} />
    </div>
  );
}

interface Props {
  offer: Offer;
  store: Store | undefined;
  today: string;
  inList: boolean;
  onOpen: (o: Offer) => void;
  onCart: (o: Offer) => void;
  onMenu: (o: Offer) => void;
  /** Unit price text, e.g. "€0.21/бр." (depends on counts the user typed in). */
  unit: string;
}

const HOLD_MS = 450;

export const OfferCard = memo(function OfferCard({ offer: o, store, today, inList, onOpen, onCart, onMenu, unit }: Props) {
  const when = whenLabel(o, today);

  // Long press (or right click) opens the card menu. Android/desktop fire
  // `contextmenu`; iOS doesn't, so a touch timer covers it. Whichever fires
  // first wins, and the click that follows the press is swallowed.
  const timer = useRef<number>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const fire = () => {
    if (fired.current) return;
    fired.current = true;
    navigator.vibrate?.(15);
    onMenu(o);
  };
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };

  return (
    <article
      class="card"
      onContextMenu={(e) => {
        e.preventDefault();
        fire();
      }}
      onTouchStart={(e) => {
        fired.current = false;
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        timer.current = window.setTimeout(fire, HOLD_MS);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel();
      }}
      onTouchEnd={(e) => {
        cancel();
        // Lifting the finger after a long press would "click" whatever is now
        // under it (the menu's backdrop); cancel that click.
        if (fired.current && e.cancelable) e.preventDefault();
      }}
      onTouchCancel={cancel}
      onMouseDown={() => (fired.current = false)}
    >
      <button
        class="open"
        aria-label={`${o.brand} ${o.name}, ${euro(o.price)}`}
        aria-haspopup="dialog"
        onClick={(e) => {
          if (fired.current) {
            e.preventDefault();
            fired.current = false;
            return;
          }
          onOpen(o);
        }}
        onKeyDown={(e) => {
          // Keyboard equivalent of the long press.
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            onMenu(o);
          }
        }}
      />
      <div style={{ position: 'relative' }}>
        <OfferImage offer={o} class="media" />
        {o.pct ? <span class="badge">−{o.pct}%</span> : null}
        <span class="storepill">
          <StoreBadge store={store} id={o.store} size={16} />
          {store?.name ?? o.store}
        </span>
        <button
          class={`cartbtn${inList ? ' on' : ''}`}
          aria-label={inList ? 'Махни от списъка' : 'Добави в списъка'}
          aria-pressed={inList}
          onClick={() => onCart(o)}
        >
          <Icon name={inList ? 'cartcheck' : 'cart'} size={18} />
        </button>
      </div>
      <div class="body">
        <div class="brand">{o.brand}</div>
        <div class="name">{o.name}</div>
        <div class="pack">{o.pack}</div>
        <div class="prices">
          <span class="price">{euro(o.price)}</span>
          {o.old ? <span class="old">{euro(o.old)}</span> : null}
        </div>
        {o.tiers?.length ? <div class="tierchip">{tierLabel(bestTier(o.tiers)!)}</div> : null}
        <div class="meta">
          <span class="unit">{unit}</span>
          {when ? <span class={`when tone-${when.tone}`}>{when.text}</span> : null}
        </div>
      </div>
    </article>
  );
});
