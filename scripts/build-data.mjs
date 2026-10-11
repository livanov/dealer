#!/usr/bin/env node
// Builds public/data/offers.json — the single file the app downloads.
// Runs in GitHub Actions on a schedule (and locally via `npm run data`).
//
// If a source fails, the stores it covers fall back to the offers from the
// currently deployed site, so one broken scraper never empties the app.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from './categories.mjs';
import { dedupe } from './normalize.mjs';
import * as bgpromo from './sources/bgpromo.mjs';
import { loadHistory, lows, record, saveHistory } from './history.mjs';
/** @import { DataFile, Offer, Store } from '../src/lib/types.ts' */

const SOURCES = [bgpromo];
const STORES = [
  { id: 'kaufland', name: 'Kaufland', color: '#E10915' },
  { id: 'lidl', name: 'Lidl', color: '#0050AA' },
  { id: 'billa', name: 'Billa', color: '#FFE600' },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/data/offers.json');
const today = new Date().toISOString().slice(0, 10);
// Price history: the `data` branch, checked out here by the workflow.
const historyDir = process.env.DEALER_HISTORY_DIR ?? resolve(root, 'history');

function previousUrl() {
  if (process.env.DEALER_PREVIOUS_URL) return process.env.DEALER_PREVIOUS_URL;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return `https://${owner}.github.io/${name}/data/offers.json`;
}

/** @returns {Promise<DataFile | null>} */
async function loadPrevious() {
  try {
    return JSON.parse(await readFile(out, 'utf8'));
  } catch {}
  const url = previousUrl();
  if (!url) return null;
  try {
    const res = await fetch(url);
    return res.ok ? /** @type {DataFile} */ (await res.json()) : null;
  } catch {
    return null;
  }
}

/** @type {Offer[]} */
const offers = [];
/** @type {Record<string, Pick<Store, 'ok' | 'source' | 'updatedAt'>>} */
const status = {};
let previous;

for (const source of SOURCES) {
  try {
    const { offers: got, scrapedAt } = await source.fetchOffers();
    for (const o of got) {
      offers.push(o);
      status[o.store] ??= { ok: true, source: source.id, updatedAt: scrapedAt };
    }
    console.log(`✓ ${source.id}: ${got.length} offers`);
  } catch (err) {
    console.error(`✗ ${source.id}: ${/** @type {Error} */ (err).message}`);
  }
}

for (const store of STORES) {
  if (status[store.id]) continue;
  previous ??= await loadPrevious();
  const old = previous?.offers?.filter((o) => o.store === store.id) ?? [];
  offers.push(...old);
  const prevStatus = previous?.stores?.find((s) => s.id === store.id);
  status[store.id] = { ok: false, source: 'previous', updatedAt: prevStatus?.updatedAt ?? null };
  console.warn(`! ${store.id}: using ${old.length} offers from the previous build`);
}

const final = dedupe(offers, today).filter((o) => STORES.some((s) => s.id === o.store));
if (final.length === 0) {
  console.error('No offers at all — refusing to publish an empty data file.');
  process.exit(1);
}

// Record only what sources returned today, not offers reused from the last build.
const history = await loadHistory(historyDir);
let historySince = null;
if (history) {
  const fresh = final.filter((o) => status[o.store]?.ok);
  const added = record(history, fresh, today);
  await saveHistory(history, today);
  historySince = lows(history, final, today);
  console.log(`History: +${added} prices, ${Object.keys(history.products).length} products since ${historySince}`);
} else {
  console.log(`History: none at ${historyDir} — skipping lowest prices`);
}

/** @type {DataFile} */
const data = {
  version: 1,
  historySince,
  generatedAt: new Date().toISOString(),
  stores: STORES.map((s) => ({
    ...s,
    ...status[s.id],
    count: final.filter((o) => o.store === s.id).length,
  })),
  categories: CATEGORIES,
  attribution: bgpromo.attribution,
  offers: final,
};

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(data));
console.log(`Wrote ${final.length} offers → ${out}`);
