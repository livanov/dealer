// Turns raw source records into the app's offer format and computes the
// derived fields (discount, price per kg/l) that the stores don't give us.

import { categorize } from './categories.mjs';
/** @import { Offer } from '../src/lib/types.ts' */

/** @param {number} n */
const round2 = (n) => Math.round(n * 100) / 100;
/** @param {string | null | undefined} s */
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/** @type {Record<string, ['kg' | 'l', number]>} */
const UNIT = {
  кг: ['kg', 1], kg: ['kg', 1], г: ['kg', 0.001], гр: ['kg', 0.001], g: ['kg', 0.001],
  л: ['l', 1], l: ['l', 1], мл: ['l', 0.001], ml: ['l', 0.001],
};
const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNITS = '(кг|kg|гр|г|g|мл|ml|л|l)(?![а-яa-z])';

/**
 * Price per kg or litre from a pack description such as "250 г",
 * "4 х 95 г", "0,75 л" or "за kg". Returns null for ranges ("88 - 256 г")
 * and anything we can't read with confidence.
 */
/** @type {(price: number, pack: string) => { value: number, unit: 'kg' | 'l' } | null} */
export function unitPrice(price, pack) {
  if (price == null || !pack) return null;
  const p = pack.toLowerCase().replace(/х/g, 'x');
  if (/\d\s*-\s*\d/.test(p) || /\sили\s/.test(p)) return null;
  if (/^(за\s*)?(кг|kg)(\.|$|\s)/.test(p.trim())) return { value: round2(price), unit: 'kg' };
  if (/^(за\s*)?(л|l)(\.|$|\s)/.test(p.trim())) return { value: round2(price), unit: 'l' };

  const multi = p.match(new RegExp(`${NUM}\\s*x\\s*${NUM}\\s*${UNITS}`, 'u'));
  const single = p.match(new RegExp(`${NUM}\\s*${UNITS}`, 'u'));
  let qty;
  let unit;
  if (multi) {
    const [, a, b, u] = multi;
    [unit, qty] = [UNIT[u][0], parseFloat(a.replace(',', '.')) * parseFloat(b.replace(',', '.')) * UNIT[u][1]];
  } else if (single) {
    const [, a, u] = single;
    [unit, qty] = [UNIT[u][0], parseFloat(a.replace(',', '.')) * UNIT[u][1]];
  } else return null;
  if (!qty || qty <= 0) return null;
  return { value: round2(price / qty), unit };
}

const PIECES = '(бр|броя|брой|капсули|капс|пранета|таблетки|табл|ролки|пакетчета|пакета|торбички|филтри|дози|пелени|кърпи)';

// Typical weight of one capsule per system (grams), for estimating how many
// capsules a box has when the pack only states its weight.
/** @type {[RegExp, number][]} */
const CAPSULE_GRAMS = [
  [/dolce gusto/i, 7],
  [/cafissimo|k-fee|caffitaly/i, 7],
  [/a modo mio/i, 7.5],
  [/nespresso/i, 5.5],
];

/**
 * How many pieces are in the pack: stated ("30 бр.", "16 капсули",
 * "20+4 бр.", "36 x 21 g") or, for coffee capsules sold by weight, estimated
 * from a typical capsule weight. Ranges ("168 - 210 г") are never guessed.
 * @returns {{ n: number, est: boolean } | null}
 */
export function pieceCount({ pack = '', name = '', brand = '' }) {
  const text = `${pack} ${name}`.toLowerCase().replace(/х/g, 'x');
  let m = text.match(new RegExp(`(\\d+)\\s*\\+\\s*(\\d+)\\s*${PIECES}(?![а-я])`, 'u'));
  if (m) return { n: +m[1] + +m[2], est: false };
  if (!new RegExp(`\\d\\s*-\\s*\\d+\\s*${PIECES}`, 'u').test(text)) {
    m = text.match(new RegExp(`(?<![\\d.,])(\\d+)\\s*${PIECES}(?![а-я])`, 'u'));
    if (m && +m[1] >= 2) return { n: +m[1], est: false };
  }
  m = pack.toLowerCase().replace(/х/g, 'x').match(/^\s*(\d+)\s*x\s*\d/);
  if (m && +m[1] >= 2) return { n: +m[1], est: false };

  const all = `${brand} ${name}`;
  if (/кафе|coffee/i.test(all) && /капсул|dolce gusto|nespresso|cafissimo/i.test(all) && !/\d\s*-\s*\d/.test(pack)) {
    const g = pack.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(г|гр|g)(?![а-яa-z])/u);
    if (g) {
      const grams = parseFloat(g[1].replace(',', '.'));
      const per = CAPSULE_GRAMS.find(([re]) => re.test(all))?.[1] ?? 5.6;
      const n = Math.round(grams / per);
      if (n >= 2) return { n, est: true };
    }
  }
  return null;
}

/**
 * @param {string} store
 * @param {string} sourceId
 */
function storeUrl(store, sourceId) {
  if (store === 'kaufland') {
    const id = sourceId.split('-')[1];
    return id ? `https://www.kaufland.bg/aktualni-predlozheniya/ot-ponedelnik/obsht-pregled/detail.so_id=${id}.html` : null;
  }
  if (store === 'lidl') {
    const id = sourceId.split('_')[1];
    return id ? `https://www.lidl.bg/p/p${id}` : null;
  }
  return null;
}

/**
 * The fields we read from a bgpromo.pages.dev record.
 * @typedef {object} BgpromoRecord
 * @property {{ name: string }} vendor
 * @property {string} promoid
 * @property {string} brand
 * @property {string} product
 * @property {string | null} package
 * @property {number} newprice
 * @property {number | null} oldprice
 * @property {string} valid_from
 * @property {string} valid_to
 * @property {string} image
 */

/**
 * @param {BgpromoRecord} raw  one record in the bgpromo.pages.dev shape
 * @returns {Offer | null} a normalized offer, or null when it's unusable
 */
export function normalizeBgpromo(raw) {
  const store = clean(raw.vendor?.name).toLowerCase();
  if (!store || raw.newprice == null) return null;

  let brand = clean(raw.brand);
  let name = clean(raw.product);
  let desc = '';
  if (store === 'billa') {
    // Billa's "brand" field holds the full product title and "product" is a
    // (sometimes long) description.
    desc = name;
    name = brand;
    brand = '';
    if (desc.toLowerCase() === name.toLowerCase()) desc = '';
  }
  if (store === 'kaufland') {
    const cyr = /[а-я]/i;
    if (name && /^[a-zа-я]/.test(name) && name[0] === name[0].toLowerCase() && cyr.test(name[0])) {
      // "Кроасан" + "с крем брюле и масло": the name continues the brand field.
      name = `${brand} ${name}`;
      brand = '';
    } else if (name && !cyr.test(name) && cyr.test(brand)) {
      // "Краве масло" / "DEUTSCHE MARKENBUTTER": fields are swapped.
      [brand, name] = [name, brand];
    }
  }
  if (!name) name = brand;
  if (!name) return null;

  const price = round2(raw.newprice);
  let old = raw.oldprice != null ? round2(raw.oldprice) : null;
  if (old != null && old <= price) old = null;
  const pct = old ? Math.round((1 - price / old) * 100) : null;
  const pack = clean(raw.package).replace(/\/опаковка$/, '');
  const up = unitPrice(price, pack);
  const pcs = pieceCount({ pack, name, brand });

  return {
    id: clean(raw.promoid),
    store,
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
    from: raw.valid_from || null,
    to: raw.valid_to || null,
    image: raw.image || null,
    url: storeUrl(store, clean(raw.promoid)),
    cat: categorize({ brand, name, desc }),
  };
}

/**
 * Drop exact duplicates and offers that already expired.
 * @param {Offer[]} offers
 * @param {string} today
 */
export function dedupe(offers, today) {
  const seen = new Set();
  const out = [];
  for (const o of offers) {
    if (o.to && o.to < today) continue;
    const key = `${o.store}|${o.brand}|${o.name}|${o.pack}|${o.price}|${o.from}|${o.to}`;
    if (seen.has(key) || seen.has(o.id)) continue;
    seen.add(key);
    seen.add(o.id);
    out.push(o);
  }
  return out;
}
