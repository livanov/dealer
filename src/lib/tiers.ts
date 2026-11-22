// Quantity prices (METRO's "Вземи повече, спести повече"): from `min` pieces
// on, each piece costs less. Offers without tiers cost the same at any quantity.

import type { PriceTier } from './types';
import { euro } from './offers';

/** Price per piece when buying `qty`. */
export function priceAt(price: number, tiers: PriceTier[] | undefined, qty: number): number {
  let p = price;
  for (const t of tiers ?? []) if (qty >= t.min && t.price < p) p = t.price;
  return p;
}

/** The cheapest tier, if any. */
export const bestTier = (tiers: PriceTier[] | undefined): PriceTier | null =>
  tiers?.length ? tiers.reduce((a, b) => (b.price < a.price ? b : a)) : null;

/** "€24.28 от 20 бр." */
export const tierLabel = (t: PriceTier) => `${euro(t.price)} от ${t.min} бр.`;
