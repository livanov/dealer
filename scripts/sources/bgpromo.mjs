// v0.1 data source: the public promos.json published by bgpromo.pages.dev,
// which already scrapes Lidl and Kaufland and re-publishes Billa offers from
// Price Barometer (prices.alexandergekov.com). Our own per-store scrapers can
// replace it store by store later; each source just returns normalized offers.

import { normalizeBgpromo } from '../normalize.mjs';

export const id = 'bgpromo';
export const URL = 'https://bgpromo.pages.dev/promos.json';
export const attribution = [
  { name: 'BG Promo', link: 'https://bgpromo.pages.dev/' },
  { name: 'Price Barometer', link: 'https://prices.alexandergekov.com' },
];

export async function fetchOffers() {
  const res = await fetch(URL, {
    headers: { 'user-agent': 'dealer-bot (+https://github.com/livanov/dealer)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${URL} → HTTP ${res.status}`);
  const json = /** @type {{ scrape_time?: string, promos?: unknown }} */ (await res.json());
  if (!Array.isArray(json.promos)) throw new Error('unexpected promos.json shape');
  return {
    scrapedAt: json.scrape_time ?? null,
    offers: json.promos.map(normalizeBgpromo).filter((o) => o !== null),
  };
}
