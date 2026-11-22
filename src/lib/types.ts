export interface Offer {
  id: string;
  store: string;
  brand: string;
  name: string;
  desc: string;
  pack: string;
  price: number;
  old: number | null;
  pct: number | null;
  unit: number | null;
  unitOf: 'kg' | 'l' | null;
  /** Pieces in the pack (capsules, washes, rolls…), stated or estimated. */
  pcs?: number | null;
  pcsEst?: boolean;
  from: string | null;
  to: string | null;
  image: string | null;
  url: string | null;
  cat: string;
  /** Lowest earlier promo price of this product: [price, day] per window. */
  low?: Partial<Record<'m3' | 'm6' | 'm12', [number, string]>>;
  /** Cheaper prices per piece when buying more (METRO), by minimum quantity. */
  tiers?: PriceTier[];
}

/** From `min` pieces on, each costs `price`. */
export interface PriceTier {
  min: number;
  price: number;
}

export interface Store {
  id: string;
  name: string;
  color: string;
  count: number;
  ok: boolean;
  source: string;
  updatedAt: string | null;
}

export interface Category {
  id: string;
  label: string;
}

export interface DataFile {
  version: number;
  generatedAt: string;
  /** First day of recorded price history (null before any). */
  historySince?: string | null;
  stores: Store[];
  categories: Category[];
  attribution: { name: string; link: string }[];
  offers: Offer[];
}

export type Validity = 'now' | 'upcoming' | 'all';
/** Piece counts the user typed in, by offer id. */
export type Counts = Record<string, number>;

export type SortKey = 'relevance' | 'pct' | 'price' | 'unit' | 'ending' | 'newest';
export type GroupKey = 'none' | 'store' | 'cat' | 'validity';

export interface Filters {
  stores: string[]; // empty = all
  cats: string[]; // empty = all
  validity: Validity;
  minPct: number;
  hide: string[];
}

export interface Watch {
  id: string;
  term: string;
  maxPrice: number | null;
  minPct: number | null;
  maxUnit: number | null;
  /** What maxUnit is per: piece, kg or litre (missing = kg or litre, older watches). */
  unitKind?: 'pc' | 'kg' | 'l' | null;
  /** For per-piece limits: also match offers whose piece count is unknown. */
  includeUnknown?: boolean;
  exclude: string[];
  createdAt: number;
}

export interface ListItem {
  id: string;
  store: string;
  name: string;
  pack: string;
  price: number;
  to: string | null;
  done: boolean;
  image?: string | null;
  /** How many to buy (default 1). */
  qty?: number;
  /** Quantity prices, copied from the offer. */
  tiers?: PriceTier[];
}

export interface InboxItem {
  id: string;
  watchId: string;
  term: string;
  body: string;
  /** The promo was announced earlier and starts today. */
  starting?: boolean;
  at: number;
  read: boolean;
}
