import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cached, invalidateCache } from './cache';

beforeEach(() => invalidateCache());

describe('cached', () => {
  it('memoizes within the TTL (loader runs once)', async () => {
    let calls = 0;
    const load = async () => { calls++; return 'v'; };
    expect(await cached('k', 1000, load)).toBe('v');
    expect(await cached('k', 1000, load)).toBe('v');
    expect(calls).toBe(1);
  });

  it('reloads after the TTL expires', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const load = async () => { calls++; return calls; };
      await cached('k2', 1000, load);
      vi.advanceTimersByTime(1500);
      await cached('k2', 1000, load);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one in-flight load for concurrent callers (no thundering herd)', async () => {
    let calls = 0;
    const load = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return 'x'; };
    const [a, b] = await Promise.all([cached('k3', 1000, load), cached('k3', 1000, load)]);
    expect(a).toBe('x');
    expect(b).toBe('x');
    expect(calls).toBe(1);
  });

  it('invalidateCache forces a reload', async () => {
    let calls = 0;
    const load = async () => { calls++; return calls; };
    await cached('k4', 10000, load);
    invalidateCache('k4');
    await cached('k4', 10000, load);
    expect(calls).toBe(2);
  });
});
