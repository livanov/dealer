// METRO Cash & Carry: the promotions in its online shop (shop.metro.bg), read
// from the shop's own JSON API, which needs no login. Two calls:
//   1. articlesearch with filter=promotion:true → the ids of promoted articles
//   2. betty-variants → names, photos, sizes, categories and the store's prices
//
// METRO is a wholesaler: shelf prices are without VAT and some deals depend on
// quantity ("Вземи повече, спести повече": e.g. 5% off from 20 pieces). We use
// the prices with VAT, for one METRO store, and keep quantity tiers as `tiers`.

import { categorize } from '../categories.mjs';
import { pieceCount, unitPrice } from '../normalize.mjs';
/** @import { Offer, PriceTier } from '../../src/lib/types.ts' */

export const id = 'metro';
export const attribution = [{ name: 'METRO', link: 'https://www.metro.bg/' }];

const BASE = 'https://shop.metro.bg';
// METRO София – Цариградско шосе. Prices can differ a little between stores.
export const STORE = process.env.METRO_STORE || '00010';
const HEADERS = { accept: 'application/json', 'user-agent': 'dealer-bot (+https://github.com/livanov/dealer)' };

/**
 * @param {string} path
 * @returns {Promise<any>}
 */
async function get(path) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(BASE + path, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 2) throw new Error(`${path.split('?')[0]} → ${/** @type {Error} */ (err).message}`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

export async function fetchOffers() {
  const q = `storeId=${STORE}&language=bg-BG&country=BG&query=*&rows=100&filter=promotion:true`;
  /** @type {string[]} */
  const ids = [];
  for (let page = 1; page <= 50; page++) {
    const r = await get(`/searchdiscover/articlesearch/search?${q}&page=${page}`);
    ids.push(...(r.resultIds ?? []));
    if (!r.nextPage || page >= r.totalPages) break;
  }
  if (!ids.length) throw new Error('no promoted articles');

  // Article details, 25 at a time, a few requests in parallel.
  const batches = [];
  for (let i = 0; i < ids.length; i += 25) batches.push(ids.slice(i, i + 25));
  /** @type {Offer[]} */
  const offers = [];
  for (let i = 0; i < batches.length; i += 4) {
    const results = await Promise.all(
      batches
        .slice(i, i + 4)
        .map((b) => get(`/evaluate.article.v1/betty-variants?storeIds=${STORE}&country=BG&locale=bg-BG&ids=${b.join(',')}&details=false`)),
    );
    for (const r of results) offers.push(...normalizeMetroArticles(r));
  }
  return { scrapedAt: new Date().toISOString(), offers };
}

/**
 * Offers from one betty-variants response: every bundle (pack) that has a
 * running or announced promotion at our store.
 * @param {any} response
 * @param {string} [store]
 * @returns {Offer[]}
 */
export function normalizeMetroArticles(response, store = STORE) {
  /** @type {Offer[]} */
  const out = [];
  for (const art of Object.values(response?.result ?? {}))
    for (const variant of Object.values(art.variants ?? {}))
      for (const bundle of Object.values(variant.bundles ?? {})) {
        const o = normalizeMetro(bundle, { food: !!art.food, store });
        if (o) out.push(o);
      }
  return out;
}

const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;
const clean = (/** @type {unknown} */ s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** A UTC timestamp as the calendar day in Bulgaria ("2026-11-18T22:00:00Z" → "2026-11-19"). */
export function sofiaDay(/** @type {string | null | undefined} */ iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' });
}

/** "1000 g" → "1 кг", "750 ml" → "750 мл", from METRO's content data. */
function packOf(/** @type {any} */ bundle) {
  if (bundle.isWeightArticle === 'WEIGHT') return 'кг';
  const vol = bundle.contentData?.netContentVolume;
  const wt = bundle.contentData?.netPieceWeight;
  const fmt = (/** @type {number} */ v, /** @type {string} */ small, /** @type {string} */ big) =>
    v >= 1000 ? `${String(round2(v / 1000)).replace('.', ',')} ${big}` : `${round2(v)} ${small}`;
  if (vol?.value && /^ML$/i.test(vol.uom)) return fmt(vol.value, 'мл', 'л');
  if (wt?.value && /^GRAM$/i.test(wt.uom)) return fmt(wt.value, 'г', 'кг');
  return '';
}

/** The size at the end of METRO's titles, which we show as the pack instead. */
const SIZE_TAIL = /[\s,]+(\d+\s*[xх]\s*)?\d+([.,]\d+)?\s*(кг|гр?|мл|л|бр\.?|kg|g|ml|l|cl|кл)\.?$/i;

// Food categories METRO's path names map to when our keywords find nothing.
const NONFOOD_OK = new Set(['household', 'cosmetics', 'pets', 'baby', 'nonfood']);

/**
 * @param {any} bundle  one bundle from a betty-variants response
 * @param {{ food: boolean, store: string }} ctx
 * @returns {Offer | null}
 */
export function normalizeMetro(bundle, { food, store }) {
  const st = bundle?.stores?.[store];
  // In-store price when given, else the default (click & collect) one.
  const spi = st?.possibleDeliveryModes?.STORE?.possibleFulfillmentTypes?.STORE?.sellingPriceInfo ?? st?.sellingPriceInfo;
  if (!spi || st?.delisted || spi.valid === false) return null;
  const promo = spi.promotionLabels?.promotion;
  const summary = spi.summaryDnrInfo?.levels ?? {};
  const first = Number(summary['1']?.finalSingleGrossPrice) || null;
  const price = round2(Number(spi.finalPrice ?? spi.grossPrice ?? first));
  if (!price || !(price > 0)) return null;

  /** @type {PriceTier[]} */
  const tiers = Object.entries(summary)
    .map(([min, l]) => ({ min: Math.round(Number(min)), price: round2(Number(l?.finalSingleGrossPrice)) }))
    .filter((t) => t.min > 1 && t.price > 0 && t.price < price)
    .sort((a, b) => a.min - b.min);
  // Neither a promotion nor a cheaper quantity: not a deal.
  if (!promo && !tiers.length) return null;

  let old = spi.grossStrikeThrough != null ? round2(Number(spi.grossStrikeThrough)) : null;
  if (old != null && old <= price) old = null;
  const pct = old ? Math.round((1 - price / old) * 100) : null;

  const brand = clean(bundle.brandInfo?.displayBrandName ?? bundle.brandName);
  let name = clean(bundle.description);
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase() + ' ')) name = name.slice(brand.length + 1);
  const pack = packOf(bundle);
  if (pack) name = name.replace(SIZE_TAIL, '').trim() || name;
  if (!name) return null;

  // "Вземи заедно: …" deals (buy X with Y) can't be priced per piece; mention them.
  const together = Object.values(spi.dnrInfo ?? {})
    .filter((d) => /** @type {any} */ (d).logic === 'ML' && !/ - DEL$/.test(/** @type {any} */ (d).name))
    .map((d) => clean(/** @type {any} */ (d).name));
  const desc = together.length ? together.join(' · ') : '';

  const up = unitPrice(price, pack);
  const pcs = pieceCount({ pack, name, brand });
  let cat = categorize({ brand, name });
  if (cat === 'other') cat = categorize({ name: (bundle.categories ?? []).map((/** @type {any} */ c) => c.name).join(' ') });
  if (!food && !NONFOOD_OK.has(cat)) cat = 'nonfood';

  const promoDays = promo ?? Object.values(spi.dnrInfo ?? {})[0] ?? {};
  const bid = bundle.bettyBundleId ?? bundle.bundleId ?? {};
  return {
    id: `M-${clean(bid.bettyBundleId ?? bundle.displayId)}`,
    store: 'metro',
    brand,
    name,
    desc,
    pack,
    price,
    old,
    pct: pct && pct > 0 ? pct : null,
    unit: up?.value ?? null,
    unitOf: up?.unit ?? null,
    pcs: pcs?.n ?? null,
    pcsEst: pcs?.est ?? false,
    from: sofiaDay(/** @type {any} */ (promoDays).start),
    to: sofiaDay(/** @type {any} */ (promoDays).end),
    image: bundle.imageUrlL || bundle.imageUrl || null,
    url: bid.articleNumber ? `${BASE}/shop/pv/${bid.articleNumber}/${bid.variantNumber}/${bid.bundleNumber}` : null,
    cat,
    ...(tiers.length ? { tiers } : {}),
  };
}
