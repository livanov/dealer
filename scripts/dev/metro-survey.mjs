#!/usr/bin/env node
// Dev helper: survey METRO's online-shop promotions (run via the Probe workflow).
// Lists promo articles, fetches their details, and summarises promo types and
// quantity ("buy more, pay less") pricing so we can design the scraper.

const BASE = 'https://shop.metro.bg';
const STORE = process.env.METRO_STORE || '00010';
const q = `storeId=${STORE}&language=bg-BG&country=BG`;
const get = async (path) => {
  const res = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
};

const ids = [];
for (let page = 1; ; page++) {
  const r = await get(`/searchdiscover/articlesearch/search?${q}&query=*&rows=100&page=${page}&filter=promotion:true`);
  ids.push(...r.resultIds);
  if (page === 1) {
    console.log('amount', r.amount, 'pages', r.totalPages);
    console.log('facets', JSON.stringify(r.allFacets ?? r.facets).slice(0, 1500));
  }
  if (!r.nextPage || page >= r.totalPages) break;
}
console.log('ids', ids.length);

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] != null).map((k) => [k, o[k]]));
const stats = { bmpl: 0, weight: {}, promos: {}, labels: {}, priceKeys: new Set() };
let shownBmpl = 0;
let shown = 0;
for (let i = 0; i < ids.length; i += 25) {
  const batch = ids.slice(i, i + 25).join(',');
  const r = await get(`/evaluate.article.v1/betty-variants?storeIds=${STORE}&country=BG&locale=bg-BG&ids=${batch}&details=false`);
  for (const art of Object.values(r.result ?? {}))
    for (const v of Object.values(art.variants ?? {}))
      for (const b of Object.values(v.bundles ?? {})) {
        const st = b.stores?.[STORE];
        const spi = st?.sellingPriceInfo;
        if (!spi) continue;
        Object.keys(spi).forEach((k) => stats.priceKeys.add(k));
        if (b.isBuyMorePayLessArticle) stats.bmpl++;
        stats.weight[b.isWeightArticle] = (stats.weight[b.isWeightArticle] ?? 0) + 1;
        for (const p of spi.applicablePromos ?? []) stats.promos[p] = (stats.promos[p] ?? 0) + 1;
        for (const l of Object.values(spi.promotionLabels ?? {})) stats.labels[`${l.type}:${l.translatedLabel}`] = (stats.labels[`${l.type}:${l.translatedLabel}`] ?? 0) + 1;
        const summary = {
          id: b.bettyBundleId?.bettyBundleId,
          name: b.description,
          brand: b.brandInfo?.displayBrandName,
          bmpl: b.isBuyMorePayLessArticle,
          weight: b.isWeightArticle,
          content: b.contentData,
          base: pick(b, ['basePriceContent', 'basePriceContentMeasureUnit', 'packagingType', 'bundleSize']),
          price: pick(spi, ['finalPrice', 'grossPrice', 'netPrice', 'shelfPrice', 'strikeThrough', 'grossStrikeThrough', 'applicablePromos', 'appliedAdjustments', 'promotionLabels', 'appliedPromotionInfo', 'averagePerUnit', 'basePriceData', 'explanation']),
          rest: Object.fromEntries(Object.entries(spi).filter(([k, v]) => /volume|stagger|tier|scale|bmpl|qty|quant|level/i.test(k) && v != null)),
          storeExtra: Object.fromEntries(Object.entries(st).filter(([k, v]) => /volume|stagger|tier|scale|bmpl|qty|quant|level|promo/i.test(k) && v != null && !(Array.isArray(v) && !v.length))),
          bundleExtra: Object.fromEntries(Object.entries(b).filter(([k, v]) => /volume|stagger|tier|scale|bmpl|qty|quant|level|promo/i.test(k) && v != null && !(Array.isArray(v) && !v.length))),
        };
        if (b.isBuyMorePayLessArticle && shownBmpl < 3) {
          shownBmpl++;
          console.log('\nBMPL EXAMPLE', JSON.stringify(summary));
          if (shownBmpl === 1) console.log('BMPL FULL STORE', JSON.stringify(st).slice(0, 9000));
        } else if (!b.isBuyMorePayLessArticle && shown < 2) {
          shown++;
          console.log('\nEXAMPLE', JSON.stringify(summary));
        }
      }
}
console.log('\nSTATS', JSON.stringify({ ...stats, priceKeys: [...stats.priceKeys] }));
