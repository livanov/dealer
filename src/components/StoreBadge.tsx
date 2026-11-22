import type { Store } from '../lib/types';

// Small letter tiles in each chain's colours, used instead of plain dots.
const LOOK: Record<string, { bg: string; fg: string; letter: string }> = {
  kaufland: { bg: '#E10915', fg: '#FFFFFF', letter: 'K' },
  lidl: { bg: '#0050AA', fg: '#FFF000', letter: 'L' },
  billa: { bg: '#FFE600', fg: '#D20A11', letter: 'B' },
  fantastico: { bg: '#E30613', fg: '#FFD200', letter: 'F' },
  tmarket: { bg: '#00873E', fg: '#FFFFFF', letter: 'T' },
  metro: { bg: '#002D72', fg: '#FFED00', letter: 'M' },
};

export function StoreBadge({ store, id, size = 18 }: { store?: Store; id?: string; size?: number }) {
  const key = store?.id ?? id ?? '';
  const look = LOOK[key] ?? { bg: store?.color ?? '#888', fg: '#fff', letter: (store?.name ?? key).slice(0, 1).toUpperCase() };
  return (
    <span
      class="storebadge"
      aria-hidden="true"
      style={{ background: look.bg, color: look.fg, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.62)}px` }}
    >
      {look.letter}
    </span>
  );
}
