#!/usr/bin/env node
// Builds public/data/offers.json — the single file the app downloads.
// Runs in GitHub Actions on a schedule (and locally via `npm run data`).
//
// A store falls back to the offers from the currently deployed site when its
// source fails or returns less than half the offers it had last time, so one
// broken scraper never empties the app.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from './categories.mjs';
import { dedupe } from './normalize.mjs';
import { keepFresh } from './fallback.mjs';
import * as bgpromo from './sources/bgpromo.mjs';
import { loadHistory, lows, record, saveHistory } from './history.mjs';

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

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(out, 'utf8'));
  } catch {}
  const url = previousUrl();
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

let offers = [];
const status = {};

for (const source of SOURCES) {
  try {
    const { offers: got, scrapedAt } = await source.fetchOffers();
    for (const o of got) {
      offers.push(o);
      status[o.store] ??= { ok: true, source: source.id, updatedAt: scrapedAt };
    }
    console.log(`✓ ${source.id}: ${got.length} offers`);
  } catch (err) {
    console.error(`✗ ${source.id}: ${err.message}`);
  }
}

const previous = await loadPrevious();
for (const store of STORES) {
  const got = offers.filter((o) => o.store === store.id);
  const old = previous?.offers?.filter((o) => o.store === store.id) ?? [];
  const prevStatus = previous?.stores?.find((s) => s.id === store.id);
  if (got.length && keepFresh(got, old, prevStatus?.updatedAt, new Date())) continue;
  offers = offers.filter((o) => o.store !== store.id).concat(old);
  status[store.id] = { ok: false, source: 'previous', updatedAt: prevStatus?.updatedAt ?? null };
  console.warn(`! ${store.id}: ${got.length} offers today, using ${old.length} from the previous build`);
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
