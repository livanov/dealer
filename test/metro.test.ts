import { describe, expect, it } from 'vitest';
import { normalizeMetro, normalizeMetroArticles, sofiaDay } from '../scripts/sources/metro.mjs';

const STORE = '00010';
const promo = { type: 'promotion', start: '2026-11-18T22:00:00Z', end: '2026-12-02T21:59:59Z', translatedLabel: 'ПРОМОЦИЯ' };

// Trimmed from real betty-variants responses (shop.metro.bg, 2026-11-22).
function bundle(over: Record<string, unknown> = {}, price: Record<string, unknown> = {}) {
  const spi = {
    finalPrice: 5.48,
    grossPrice: 5.48,
    netPrice: 4.57,
    strikeThrough: 6.4,
    grossStrikeThrough: 7.68,
    valid: true,
    dnrInfo: {},
    summaryDnrInfo: null,
    promotionLabels: { promotion: promo },
    ...price,
  };
  return {
    bettyBundleId: { bettyBundleId: 'BTY-X34044700320021', articleNumber: 'BTY-X340447', variantNumber: '0032', bundleNumber: '0021' },
    description: 'aro Краве масло 1кг',
    brandInfo: { displayBrandName: 'aro' },
    isWeightArticle: 'NON_WEIGHT',
    contentData: { netPieceWeight: { value: 1000, uom: 'GRAM' } },
    imageUrlL: 'https://cdn.metro-group.com/bg/bg_pim_340405001001_01.png?w=400&h=400',
    categories: [{ name: 'Хранителни стоки / Млечни продукти и яйца / Масло и сметана / Масло' }],
    stores: { [STORE]: { sellingPriceInfo: spi } },
    ...over,
  };
}

describe('METRO offers', () => {
  it('reads a plain promotion with VAT, dates in Bulgarian time and the size as pack', () => {
    const o = normalizeMetro(bundle(), { food: true, store: STORE })!;
    expect(o).toMatchObject({
      id: 'M-BTY-X34044700320021',
      store: 'metro',
      brand: 'aro',
      name: 'Краве масло',
      pack: '1 кг',
      price: 5.48,
      old: 7.68,
      pct: 29,
      unit: 5.48,
      unitOf: 'kg',
      from: '2026-11-19',
      to: '2026-12-02',
      cat: 'dairy',
      url: 'https://shop.metro.bg/shop/pv/BTY-X340447/0032/0021',
    });
    expect(o.tiers).toBeUndefined();
  });

  it('keeps quantity prices as tiers', () => {
    const o = normalizeMetro(
      bundle(
        { description: 'REGALIDEA Комплект Lindt enatale 5 част 1562г', brandInfo: { displayBrandName: 'REGALIDEA' }, contentData: {} },
        {
          finalPrice: 25.55,
          grossStrikeThrough: 28.28,
          summaryDnrInfo: {
            levels: {
              '1': { finalSingleGrossPrice: '25.55' },
              '20': { value: '0.05', finalSingleGrossPrice: '24.28' },
            },
          },
        },
      ),
      { food: true, store: STORE },
    )!;
    expect(o.price).toBe(25.55);
    expect(o.tiers).toEqual([{ min: 20, price: 24.28 }]);
  });

  it('mentions "take together" deals, which have no per-piece price', () => {
    const o = normalizeMetro(
      bundle(
        { description: 'LA SASTRERIA Вино червено 750мл', brandInfo: { displayBrandName: 'LA SASTRERIA' }, contentData: { netContentVolume: { value: 750, uom: 'ML' } } },
        {
          finalPrice: 3.98,
          grossStrikeThrough: null,
          dnrInfo: {
            a: { name: 'ВЗЕМИ ЗАЕДНО: 1МЕ ХЛАД.ВИТР.+ 6 БУТ. ВИНО', logic: 'ML', levels: {} },
            b: { name: 'ВЗЕМИ ЗАЕДНО: 1МЕ ХЛАД.ВИТР.+ 6 БУТ. ВИНО  - DEL', logic: 'ML', levels: {} },
          },
        },
      ),
      { food: true, store: STORE },
    )!;
    expect(o).toMatchObject({ name: 'Вино червено', pack: '750 мл', unitOf: 'l', desc: 'ВЗЕМИ ЗАЕДНО: 1МЕ ХЛАД.ВИТР.+ 6 БУТ. ВИНО', cat: 'alcohol', old: null });
  });

  it('prices weighed goods per kg and files non-food under non-food', () => {
    const cheese = normalizeMetro(bundle({ description: 'Сирене краве', brandInfo: {}, isWeightArticle: 'WEIGHT' }), { food: true, store: STORE })!;
    expect(cheese).toMatchObject({ name: 'Сирене краве', pack: 'кг', unitOf: 'kg' });
    const paper = normalizeMetro(
      bundle({ description: 'aro Копирна хартия A4 500л', contentData: { netPieceWeight: { value: 600, uom: 'GRAM' } }, categories: [{ name: 'Офис' }] }),
      { food: false, store: STORE },
    )!;
    expect(paper).toMatchObject({ cat: 'nonfood', pack: '', unit: null, name: 'Копирна хартия A4 500л' });
  });

  it('skips articles without a deal or a price at our store', () => {
    expect(normalizeMetro(bundle({}, { promotionLabels: {} }), { food: true, store: STORE })).toBeNull();
    expect(normalizeMetro(bundle({ stores: {} }), { food: true, store: STORE })).toBeNull();
    expect(normalizeMetro(bundle({}, { valid: false }), { food: true, store: STORE })).toBeNull();
  });

  it('walks a whole response', () => {
    const res = { result: { a: { food: true, variants: { '0032': { bundles: { '0021': bundle() } } } } } };
    expect(normalizeMetroArticles(res, STORE)).toHaveLength(1);
  });

  it('leaves standing deals open-ended', () => {
    const bowl = normalizeMetro(
      bundle(
        { description: 'METRO PROFESSIONAL Купа кръгла 24см', brandInfo: { displayBrandName: 'METRO PROFESSIONAL' } },
        {
          finalPrice: 9.98,
          grossStrikeThrough: null,
          promotionLabels: {},
          dnrInfo: { x: { name: 'КУПИ ПОВЕЧЕ', logic: 'QD', start: '2026-01-08T22:00:00Z', end: '2949-01-01T21:59:00Z' } },
          summaryDnrInfo: { levels: { '1': { finalSingleGrossPrice: '9.98' }, '2': { finalSingleGrossPrice: '9.18' }, '3': { finalSingleGrossPrice: '7.99' } } },
        },
      ),
      { food: false, store: STORE },
    )!;
    expect(bowl).toMatchObject({ from: '2026-01-09', to: null, pack: '', tiers: [{ min: 2, price: 9.18 }, { min: 3, price: 7.99 }] });
  });

  it('converts UTC times to the day in Sofia', () => {
    expect(sofiaDay('2026-11-18T22:00:00Z')).toBe('2026-11-19');
    expect(sofiaDay('2026-12-02T21:59:59Z')).toBe('2026-12-02');
    expect(sofiaDay(null)).toBeNull();
  });
});
