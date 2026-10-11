// Price history, kept on the `data` branch (checked out into ./history by the
// workflow). Each data run adds the prices it saw; the build then works out
// each current offer's lowest earlier price over 3, 6 and 12 months.
//
// Layout:
//   products.json      { [pid]: { s: store, n: name, k: pack } }   (for reading the files)
//   prices/YYYY-MM.json [[pid, price, old, from, to, seen, last, id], …]   (first/last day seen, offer id)
//
// A product is the same store + brand/name + pack after normalising case,
// punctuation and spacing. Each record keeps its offer id too: where a store
// reuses ids (Kaufland's look like product numbers), a renamed product still matches.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();

export const productKey = (o) => `${o.store}|${norm(`${o.brand} ${o.name}`)}|${norm(o.pack)}`;
export const productId = (o) => createHash('sha1').update(productKey(o)).digest('hex').slice(0, 12);

const VAGUE_CATS = new Set(['nonfood', 'other']);
const WINDOWS = { m3: 92, m6: 183, m12: 366 };
const month = (day) => day.slice(0, 7);

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function loadHistory(dir) {
  if (!dir || !existsSync(dir)) return null;
  const products = await readJson(join(dir, 'products.json'), {});
  const months = {};
  const files = existsSync(join(dir, 'prices')) ? await readdir(join(dir, 'prices')) : [];
  for (const f of files.filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort())
    months[f.slice(0, 7)] = await readJson(join(dir, 'prices', f), []);
  return { dir, products, months };
}

/** Add today's offers; returns how many new price records were written. */
export function record(history, offers, today) {
  const { products, months } = history;
  const m = (months[month(today)] ??= []);
  const rows = new Map(m.map((r) => [`${r[0]}|${r[1]}|${r[3]}`, r]));
  let added = 0;
  for (const o of offers) {
    const pid = productId(o);
    products[pid] ??= { s: o.store, n: o.brand ? `${o.brand} ${o.name}` : o.name, k: o.pack };
    const key = `${pid}|${o.price}|${o.from}`;
    const row = rows.get(key);
    if (row) {
      row[6] = today;
      continue;
    }
    const fresh = [pid, o.price, o.old, o.from, o.to, today, today, o.id];
    rows.set(key, fresh);
    m.push(fresh);
    added++;
  }
  return added;
}

export async function saveHistory(history, today) {
  const { dir, products, months } = history;
  await mkdir(join(dir, 'prices'), { recursive: true });
  // One entry per line keeps git diffs small. Only this month's price file changes.
  const entries = Object.entries(products).map(([pid, p]) => `${JSON.stringify(pid)}:${JSON.stringify(p)}`);
  await writeFile(join(dir, 'products.json'), `{\n${entries.join(',\n')}\n}\n`);
  const m = months[month(today)] ?? [];
  await writeFile(join(dir, 'prices', `${month(today)}.json`), `[\n${m.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
}

/**
 * For each offer: the lowest price of the same product in earlier promos
 * (not this one), per window, as { m3: [price, day], … }. Also returns the
 * first day of history so the app can say how far back it looked.
 */
export function lows(history, offers, today) {
  const byPid = new Map();
  const byId = new Map();
  const push = (map, key, r) => {
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  };
  let since = null;
  for (const recs of Object.values(history.months))
    for (const r of recs) {
      push(byPid, r[0], r);
      if (r[7]) push(byId, r[7], r);
      if (!since || r[5] < since) since = r[5];
    }

  for (const o of offers) {
    // Names are too vague to match on when bare (no brand, no pack) or for
    // clothes and gadgets, where "ESMARA Топ комплект" is a dozen different items.
    const byName = (o.brand || o.pack) && !VAGUE_CATS.has(o.cat) ? productId(o) : null;
    const recs = [...new Set([...(byName ? byPid.get(byName) ?? [] : []), ...(byId.get(o.id) ?? [])])];
    const start = o.from ?? today;
    const low = {};
    for (const [w, days] of Object.entries(WINDOWS)) {
      const after = addDays(today, -days);
      let best = null;
      for (const [, price, , from, to, seen, last] of recs) {
        const day = from ?? seen;
        // Only promos that were over before this one started; one that
        // overlaps (the same product listed twice) isn't history.
        if (day < after || day >= start || (to ?? last ?? seen) >= start) continue;
        if (!best || price < best[0] || (price === best[0] && day > best[1])) best = [price, day];
      }
      if (best) low[w] = best;
    }
    if (Object.keys(low).length) o.low = low;
  }
  return since;
}
