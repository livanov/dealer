import { dedupe } from './normalize.mjs';

/** @import { Offer } from '../src/lib/types.ts' */

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether to publish a store's offers from today's scrape rather than fall
 * back to the previous build's. Fewer than half as many unexpired offers as
 * the previous build looks like a broken scrape, but only until the previous
 * offers are two days old: Lidl's have no end dates, so after a real drop
 * they would otherwise be kept forever.
 * @param {Offer[]} fresh
 * @param {Offer[]} previous
 * @param {string | null | undefined} previousAt when the previous offers were scraped
 * @param {Date} now
 * @returns {boolean}
 */
export function keepFresh(fresh, previous, previousAt, now) {
  const today = now.toISOString().slice(0, 10);
  if (dedupe(fresh, today).length * 2 >= dedupe(previous, today).length) return true;
  const scraped = Date.parse(previousAt ?? '');
  return Number.isNaN(scraped) || now.getTime() - scraped >= 2 * DAY;
}
