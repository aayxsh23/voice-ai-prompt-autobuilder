/**
 * Minimal in-memory TTL cache. Per-process only — for multi-instance deployments
 * swap the store for Redis behind the same `cached()` interface. Concurrent callers
 * for the same key share one in-flight load (no thundering herd).
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Returns the cached value for `key` if it is still fresh, otherwise runs `loader`,
 * caches the result for `ttlMs`, and returns it.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && now < hit.expiresAt) return hit.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** Invalidate a single key, or the whole cache when no key is given. */
export function invalidateCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
