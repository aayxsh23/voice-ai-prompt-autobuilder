/**
 * Minimal in-memory fixed-window rate limiter. Guards expensive LLM endpoints
 * against runaway cost/abuse. Per-process only — for multi-instance deployments
 * swap the store for Redis (same interface).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/** Best-effort client key from proxy headers, falling back to a shared bucket. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'anon').slice(0, 100);
}
