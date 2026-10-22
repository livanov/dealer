import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script
import { loadHistory, lows, productId, record, saveHistory } from '../scripts/history.mjs';

const offer = (p: Record<string, unknown>) => ({ id: 'K-1', store: 'kaufland', brand: 'Вълчев', name: 'Крема сирене', pack: '125 г', price: 0.85, old: 1.25, from: '2026-10-05', to: '2026-10-11', ...p });

describe('price history', () => {
  it('records each promo price once, with its offer id', () => {
    const h = { products: {}, months: {} as Record<string, unknown[]> };
    expect(record(h, [offer({})], '2026-10-05')).toBe(1);
    expect(record(h, [offer({})], '2026-10-06')).toBe(0);
    expect(record(h, [offer({ id: 'K-9', price: 0.79 })], '2026-10-06')).toBe(1);
    expect(h.months['2026-10']).toHaveLength(2);
    expect(h.months['2026-10'].map((r) => (r as unknown[])[7])).toEqual(['K-1', 'K-9']);
  });

  it('matches the same product despite case and punctuation', () => {
    expect(productId(offer({ name: 'КРЕМА СИРЕНЕ,' }))).toBe(productId(offer({})));
    expect(productId(offer({ pack: '200 г' }))).not.toBe(productId(offer({})));
  });

  it('finds the lowest earlier price per window, not counting the current promo', () => {
    const h = { products: {}, months: {} };
    record(h, [offer({ price: 0.69, from: '2026-03-02', to: '2026-03-08' })], '2026-03-02');
    record(h, [offer({ price: 0.79, from: '2026-08-03', to: '2026-08-09' })], '2026-08-03');
    record(h, [offer({ price: 0.99, from: '2026-09-07', to: '2026-09-13' })], '2026-09-07');
    const now = offer({ price: 0.75 });
    record(h, [now], '2026-10-05');
    const since = lows(h, [now], '2026-10-06');
    expect(since).toBe('2026-03-02');
    expect(now.low).toEqual({ m3: [0.79, '2026-08-03'], m6: [0.79, '2026-08-03'], m12: [0.69, '2026-03-02'] });
  });

  it('follows a renamed product through a reused offer id', () => {
    const h = { products: {}, months: {} };
    record(h, [offer({ price: 0.65, from: '2026-09-01', to: '2026-09-07' })], '2026-09-01');
    const renamed = offer({ name: 'Крема сирене натурално', price: 0.85 });
    lows(h, [renamed], '2026-10-06');
    expect(renamed.low?.m3).toEqual([0.65, '2026-09-01']);
  });

  it('weighs every earlier promo, found by product or by offer id, across months', () => {
    const h = { products: {}, months: {} };
    const promo = (from: string, to: string, p: Record<string, unknown>) => record(h, [offer({ from, to, ...p })], from);
    promo('2026-01-05', '2026-01-11', { price: 0.55 });
    promo('2026-05-04', '2026-05-10', { id: 'K-2', price: 0.65 });
    promo('2026-06-01', '2026-06-07', { price: 0.99 });
    promo('2026-08-03', '2026-08-09', { name: 'Крема сирене натурално', price: 0.72 });
    promo('2026-09-07', '2026-09-13', { price: 0.89 });
    const now = offer({ price: 0.85 });
    expect(lows(h, [now], '2026-10-06')).toBe('2026-01-05');
    expect(now.low).toEqual({ m3: [0.72, '2026-08-03'], m6: [0.65, '2026-05-04'], m12: [0.55, '2026-01-05'] });
  });

  it('saves products.json as JSON with one product per line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dealer-history-'));
    try {
      const h = { dir, products: {}, months: {} };
      const a = offer({});
      const b = offer({ id: 'K-2', name: 'Кашкавал', pack: '200 г' });
      record(h, [a, b], '2026-10-05');
      await saveHistory(h, '2026-10-05');
      const text = await readFile(join(dir, 'products.json'), 'utf8');
      expect(text.split('\n')).toEqual([
        '{',
        `"${productId(a)}":{"s":"kaufland","n":"Вълчев Крема сирене","k":"125 г"},`,
        `"${productId(b)}":{"s":"kaufland","n":"Вълчев Кашкавал","k":"200 г"}`,
        '}',
        '',
      ]);
      expect((await loadHistory(dir)).products).toEqual(h.products);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('vague names', () => {
  it('does not match a bare name without brand or pack', () => {
    const h = { products: {}, months: {} };
    const bare = { brand: '', pack: '', name: 'Топ комплект' };
    record(h, [offer({ ...bare, id: 'L-1', price: 5, from: '2026-09-01', to: '2026-09-07' })], '2026-09-01');
    const now = offer({ ...bare, id: 'L-2', price: 7 });
    lows(h, [now], '2026-10-06');
    expect(now.low).toBeUndefined();
  });
});
