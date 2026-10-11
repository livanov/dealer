import { afterEach, describe, expect, it, vi } from 'vitest';

type Fake = Record<string, unknown>;

// Just enough indexedDB for src/lib/idb.ts: each open() and each transaction
// fires the next of `events` once the caller has attached its handlers.
function stubIndexedDB(...events: [type: string, props?: Fake][]) {
  const later = (target: Fake) => {
    const [type, props] = events.shift()!;
    setTimeout(() => {
      Object.assign(target, props);
      (target[`on${type}`] as (() => void) | undefined)?.();
    });
    return target;
  };
  const db = { transaction: () => later({ objectStore: () => ({ put: () => ({}) }) }) };
  const open = vi.fn(() => later({ result: db }));
  vi.stubGlobal('indexedDB', { open });
  return open;
}

describe('idb', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('rejects a write that aborts while committing', async () => {
    const quota = new DOMException('Quota exceeded', 'QuotaExceededError');
    stubIndexedDB(['success'], ['abort', { error: quota }]);
    const { idbSet } = await import('../src/lib/idb');
    await expect(idbSet('data', {})).rejects.toBe(quota);
  });

  it('opens the database again after a failed open', async () => {
    const broken = new DOMException('Internal error', 'UnknownError');
    const open = stubIndexedDB(['error', { error: broken }], ['success'], ['complete']);
    const { idbSet } = await import('../src/lib/idb');
    await expect(idbSet('k', 1)).rejects.toBe(broken);
    await expect(idbSet('k', 1)).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledTimes(2);
  });
});
