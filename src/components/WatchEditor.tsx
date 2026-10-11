import { useMemo, useState } from 'preact/hooks';
import type { Offer, Watch } from '../lib/types';
import { watchMatches, type MatchCtx } from '../lib/watch';
import type { UnitKind } from '../lib/units';
import { Sheet } from './Sheet';

const num = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const str = (n: number | null) => (n == null ? '' : String(n));

export function WatchEditor({
  initial,
  offers,
  today,
  ctx,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Watch;
  offers: Offer[];
  today: string;
  ctx: MatchCtx;
  onSave: (w: Watch) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState(initial.term);
  const [maxPrice, setMaxPrice] = useState(str(initial.maxPrice));
  const [minPct, setMinPct] = useState(str(initial.minPct));
  const [maxUnit, setMaxUnit] = useState(str(initial.maxUnit));
  const [unitKind, setUnitKind] = useState(initial.unitKind);
  const [includeUnknown, setIncludeUnknown] = useState(!!initial.includeUnknown);
  const [exclude, setExclude] = useState(initial.exclude.join(', '));

  const draft: Watch = {
    ...initial,
    term: term.trim(),
    maxPrice: num(maxPrice),
    minPct: num(minPct),
    maxUnit: num(maxUnit),
    unitKind,
    includeUnknown: unitKind === 'pc' && includeUnknown,
    exclude: exclude.split(',').map((s) => s.trim()).filter(Boolean),
  };
  const count = useMemo(
    () => (draft.term ? offers.filter((o) => watchMatches(draft, o, today, ctx)).length : 0),
    [offers, ctx, draft.term, draft.maxPrice, draft.minPct, draft.maxUnit, unitKind, includeUnknown, draft.exclude.join('|')],
  );

  return (
    <Sheet
      title={onDelete ? 'Промени следене' : 'Следи продукт'}
      onClose={onClose}
      action={
        onDelete ? (
          <button class="textbtn danger" onClick={onDelete}>
            Изтрий
          </button>
        ) : undefined
      }
      footer={
        <button class="primary" disabled={!draft.term} onClick={() => onSave(draft)}>
          {draft.term ? `Запази · ${count} ${count === 1 ? 'оферта сега' : 'оферти сега'}` : 'Въведи продукт'}
        </button>
      }
    >
      <label class="field">
        <span class="label">Продукт или марка</span>
        <input value={term} placeholder="напр. Dolce Gusto" onInput={(e) => setTerm(e.currentTarget.value)} autoFocus={!initial.term} />
      </label>
      <div class="section">
        <span class="label">Уведоми ме, когато (поне едно)</span>
        <div class="fields2">
          <label class="field">
            <span class="hint">цена ≤ €</span>
            <input inputMode="decimal" value={maxPrice} placeholder="—" onInput={(e) => setMaxPrice(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span class="hint">отстъпка ≥ %</span>
            <input inputMode="numeric" value={minPct} placeholder="—" onInput={(e) => setMinPct(e.currentTarget.value)} />
          </label>
        </div>
        <div class="field">
          <span class="hint">цена за единица ≤ €</span>
          <div class="row" style={{ gap: '8px' }}>
            <input
              class="grow"
              inputMode="decimal"
              value={maxUnit}
              placeholder={unitKind === 'pc' ? 'напр. 0.25' : '—'}
              aria-label="Максимална цена за единица"
              onInput={(e) => setMaxUnit(e.currentTarget.value)}
            />
            <div class="seg" style={{ flexShrink: 0 }} role="radiogroup" aria-label="Единица">
              {(
                [
                  ['pc', 'бр.'],
                  ['kg', 'кг'],
                  ['l', 'л'],
                ] as [UnitKind, string][]
              ).map(([k, label]) => (
                <button role="radio" aria-checked={unitKind === k} aria-pressed={unitKind === k} style={{ padding: '0 12px' }} onClick={() => setUnitKind(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {unitKind === 'pc' ? (
            <label class="row hint" style={{ gap: '8px', marginTop: '4px' }}>
              <input type="checkbox" checked={includeUnknown} onChange={(e) => setIncludeUnknown(e.currentTarget.checked)} />
              Включи и оферти без известен брой в опаковката
            </label>
          ) : null}
        </div>
        <p class="hint">Без граници – уведомление за всяка нова оферта, която съвпада.</p>
      </div>
      <label class="field">
        <span class="label">Без думите</span>
        <input value={exclude} placeholder="напр. моторно, спрей" onInput={(e) => setExclude(e.currentTarget.value)} />
      </label>
    </Sheet>
  );
}
