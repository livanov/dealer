import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataFile } from '../src/lib/types';

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../src/lib/idb', () => ({
  idbGet: async (key: string) => kv.get(key),
  idbSet: vi.fn(async (key: string, value: unknown) => void kv.set(key, value)),
}));

import { idbSet } from '../src/lib/idb';
import { refresh } from '../src/lib/watch';

describe('refresh', () => {
  const cached = { generatedAt: '2026-10-10T18:00:00Z', offers: [] } as unknown as DataFile;
  beforeEach(() => {
    kv.clear();
    kv.set('data', cached);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the cached data and says the download failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await refresh('data/offers.json', null)).toEqual({ data: cached, fetched: false });
  });

  it('returns and caches the downloaded data', async () => {
    const latest = { generatedAt: '2026-10-11T07:15:00Z', offers: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(latest))));
    expect(await refresh('data/offers.json', null)).toEqual({ data: latest, fetched: true });
    expect(kv.get('data')).toEqual(latest);
  });

  it('returns the downloaded data when caching it fails, without alerts', async () => {
    const latest = { generatedAt: '2026-10-11T07:15:00Z', stores: [], offers: [{ id: 'K-1', store: 'kaufland', name: 'Кафе', price: 1 }] };
    kv.set('watches', [{ id: 'w', term: 'кафе', exclude: [] }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(latest))));
    vi.mocked(idbSet).mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    const notify = vi.fn();
    expect(await refresh('data/offers.json', notify)).toEqual({ data: latest, fetched: true });
    expect(kv.get('data')).toBe(cached);
    expect(kv.has('checkedAt')).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
