#!/usr/bin/env node
// Dev helper: how METRO encodes quantity deals ("dnr" / buy more, pay less).
const BASE = 'https://shop.metro.bg';
const STORE = '00010';
const get = async (path) => {
  const res = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
};
const q = `storeId=${STORE}&language=bg-BG&country=BG`;
const ids = [];
for (let page = 1; page <= 8; page++) ids.push(...(await get(`/searchdiscover/articlesearch/search?${q}&query=*&rows=100&page=${page}&filter=promotion:true`)).body.resultIds);

const dnr = [];
const bmpl = [];
for (let i = 0; i < ids.length; i += 25) {
  const r = (await get(`/evaluate.article.v1/betty-variants?storeIds=${STORE}&country=BG&locale=bg-BG&ids=${ids.slice(i, i + 25).join(',')}&details=false`)).body;
  for (const art of Object.values(r.result ?? {}))
    for (const v of Object.values(art.variants ?? {}))
      for (const b of Object.values(v.bundles ?? {})) {
        const spi = b.stores?.[STORE]?.sellingPriceInfo;
        if (spi?.applicablePromos?.includes('dnr') || Object.keys(spi?.dnrInfo ?? {}).length || spi?.summaryDnrInfo) dnr.push({ b, spi, vid: v.bettyVariantId.bettyVariantId });
        else if (b.isBuyMorePayLessArticle) bmpl.push({ b, spi, vid: v.bettyVariantId.bettyVariantId });
      }
}
console.log('dnr', dnr.length, 'bmpl-only', bmpl.length);
for (const { b, spi } of dnr.slice(0, 4))
  console.log('\nDNR', b.description, JSON.stringify({ final: spi.finalPrice, strike: spi.grossStrikeThrough, applicable: spi.applicablePromos, applied: spi.appliedAdjustments, labels: spi.promotionLabels, dnrInfo: spi.dnrInfo, summaryDnrInfo: spi.summaryDnrInfo, available: spi.availablePromotions, evaluatePromotions: b.stores[STORE].evaluatePromotions, selectedFT: b.stores[STORE].selectedFTEvaluatePromotions }));
// Quantity-dependent price: try common parameter names on one dnr and one bmpl article.
for (const { b, vid } of [dnr[0], bmpl[0]].filter(Boolean)) {
  console.log('\nQTY TRY', b.description, vid);
  for (const p of ['', '&quantity=6', '&qty=6', '&quantities=6', `&bundleQuantities=${b.bettyBundleId.bettyBundleId}:6`]) {
    const r = await get(`/evaluate.article.v1/betty-variants?storeIds=${STORE}&country=BG&locale=bg-BG&ids=${vid}&details=false${p}`);
    const bb = r.body?.result && Object.values(Object.values(r.body.result)[0].variants)[0].bundles;
    const s = bb && Object.values(bb)[0].stores[STORE].sellingPriceInfo;
    console.log(' ', p || '(none)', r.status, s ? JSON.stringify({ final: s.finalPrice, sumGross: s.finalPricesInfo?.sumGross, avg: s.finalPricesInfo?.avgPerUnitSumGross, dnr: s.dnrInfo, sdnr: s.summaryDnrInfo }) : String(r.body).slice(0, 200));
  }
}
// The BMPL catalogue ("Цени на ниво") is where tiers are advertised.
for (const u of ['https://www.metro.bg/oferti/broshuri', 'https://catalogues.metro.bg/bmpl-2611-12/page/1']) {
  const res = await fetch(u);
  const t = await res.text();
  console.log('\nPAGE', u, res.status, t.length);
  for (const m of t.matchAll(/(cimdata|feeds=|collection_id|metronom\.com[^"' ]{0,200}|api[^"' ]{0,120})/g)) console.log('  ', t.slice(Math.max(0, m.index - 80), m.index + 220).replace(/\s+/g, ' '));
}
