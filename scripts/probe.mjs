#!/usr/bin/env node
// Dev helper: fetch pages from a GitHub runner (which, unlike some dev
// sandboxes, can reach the stores) and print what's useful for writing a
// scraper: status, title, script/data URLs and snippets around keywords.
// Usage: node scripts/probe.mjs <url> [url…]   (run via the "Probe" workflow)

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const KEYS = /api|graphql|__NEXT_DATA__|__NUXT__|application\/ld\+json|\.json|promo|offer|product|brochure|catalog|leaflet|pdf/gi;

for (const url of process.argv.slice(2)) {
  console.log(`\n===== ${url}`);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'bg-BG,bg;q=0.9' }, redirect: 'follow' });
    const text = await res.text();
    console.log(`status ${res.status} · ${res.headers.get('content-type')} · ${text.length} bytes · final ${res.url}`);
    if (!/html/.test(res.headers.get('content-type') ?? '')) {
      console.log(text.slice(0, 1500));
      continue;
    }
    console.log('title:', (text.match(/<title[^>]*>([^<]*)/i) ?? [])[1]?.trim());
    const srcs = [...text.matchAll(/(?:src|href)="([^"]+\.(?:js|json)[^"]*)"/g)].map((m) => m[1]);
    console.log('scripts/data:', [...new Set(srcs)].slice(0, 25).join('\n  '));
    const links = [...text.matchAll(/href="([^"]*(?:promo|oferti|offer|broshur|brochure|katalog|catalog|leaflet|produkt|product)[^"]*)"/gi)].map((m) => m[1]);
    console.log('links:', [...new Set(links)].slice(0, 30).join('\n  '));
    const seen = new Set();
    let n = 0;
    for (const m of text.matchAll(KEYS)) {
      const at = m.index ?? 0;
      const key = Math.floor(at / 400);
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`… ${text.slice(Math.max(0, at - 150), at + 250).replace(/\s+/g, ' ')}`);
      if (++n >= 25) break;
    }
  } catch (err) {
    console.log('ERROR', /** @type {Error} */ (err).message);
  }
}
