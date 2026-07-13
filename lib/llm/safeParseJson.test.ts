import { describe, it, expect } from 'vitest';
import { safeParseJson } from './types';

describe('safeParseJson', () => {
  it('parses plain JSON', () => {
    expect(safeParseJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('strips markdown code fences', () => {
    expect(safeParseJson('```json\n{"a":1}\n```', {})).toEqual({ a: 1 });
  });

  it('strips <think> reasoning tags before parsing', () => {
    expect(safeParseJson('<think>reasoning here</think>{"a":2}', {})).toEqual({ a: 2 });
  });

  it('extracts the outermost object from surrounding prose', () => {
    expect(safeParseJson('here you go {"a":3} thanks', {})).toEqual({ a: 3 });
  });

  it('returns the fallback on unparseable input', () => {
    expect(safeParseJson('not json at all', { ok: false })).toEqual({ ok: false });
  });
});
