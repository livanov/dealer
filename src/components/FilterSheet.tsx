import { useState } from 'preact/hooks';
import type { Category, Filters, Store, Validity } from '../lib/types';
import { clearFilters } from '../lib/prefs';
import { Sheet } from './Sheet';
import { StoreBadge } from './StoreBadge';
import { Icon } from './Icon';

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function FilterSheet({
  initial,
  stores,
  cats,
  catCounts,
  onApply,
  onClose,
}: {
  initial: Filters;
  stores: Store[];
  cats: Category[];
  catCounts: Record<string, number>;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<Filters>(initial);
  const [word, setWord] = useState('');
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const addWord = () => {
    const w = word.trim();
    if (w && !f.hide.includes(w)) set({ hide: [...f.hide, w] });
    setWord('');
  };

  return (
    <Sheet
      title="Филтри"
      onClose={onClose}
      action={
        <button class="textbtn" onClick={() => setF(clearFilters(f))}>
          Изчисти
        </button>
      }
      footer={
        <button class="primary" onClick={() => onApply(word.trim() ? { ...f, hide: [...f.hide, word.trim()] } : f)}>
          Покажи резултатите
        </button>
      }
    >
      <section class="section">
        <h3>Магазини</h3>
        <div class="tiles">
          {stores.map((s) => (
            <button class="tile" aria-pressed={f.stores.includes(s.id)} onClick={() => set({ stores: toggle(f.stores, s.id) })}>
              <StoreBadge store={s} size={22} />
              <span class="tname">{s.name}</span>
              <span class="tsub">{s.count} оферти</span>
            </button>
          ))}
        </div>
      </section>

      <section class="section">
        <h3>Категории</h3>
        <div class="chips">
          {cats
            .filter((c) => catCounts[c.id])
            .map((c) => (
              <button class="chip" aria-pressed={f.cats.includes(c.id)} onClick={() => set({ cats: toggle(f.cats, c.id) })}>
                {c.label}
              </button>
            ))}
        </div>
      </section>

      <section class="section">
        <h3>Валидност</h3>
        <div class="seg">
          {(
            [
              ['now', 'Сега'],
              ['upcoming', 'Предстоящи'],
              ['all', 'Всички'],
            ] as [Validity, string][]
          ).map(([v, label]) => (
            <button aria-pressed={f.validity === v} onClick={() => set({ validity: v })}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section class="section">
        <h3>Минимална отстъпка</h3>
        <div class="seg">
          {[0, 10, 25, 50].map((n) => (
            <button aria-pressed={f.minPct === n} onClick={() => set({ minPct: n })}>
              {n ? `${n}%+` : 'Всяка'}
            </button>
          ))}
        </div>
      </section>

      <section class="section">
        <h3>Скрий думи</h3>
        <div class="tagbox">
          {f.hide.map((w) => (
            <span class="tag">
              {w}
              <button aria-label={`Премахни „${w}“`} onClick={() => set({ hide: f.hide.filter((x) => x !== w) })}>
                <Icon name="close" size={12} stroke={3} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={word}
            placeholder="напр. моторно"
            aria-label="Добави дума за скриване"
            enterKeyHint="done"
            onInput={(e) => setWord(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addWord();
              }
            }}
            onBlur={addWord}
          />
        </div>
      </section>
    </Sheet>
  );
}
