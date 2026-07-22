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

  // The old brace-substring fallback cut on the LAST brace anywhere — including one
  // inside a string value — so payloads whose string values contained `{`/`}` (like
  // a Markdown "script" field) parsed as garbage or fell through to fallback.
  it('handles JSON whose string values contain braces (string-aware extraction)', () => {
    const raw = 'preamble {"script":"say: {greet} then {ask}", "n":1} tail';
    expect(safeParseJson<{ script: string; n: number }>(raw, { script: '', n: 0 }))
      .toEqual({ script: 'say: {greet} then {ask}', n: 1 });
  });

  // LLMs often emit raw newlines inside string values. Repair pass escapes them.
  it('repairs unescaped newlines inside string values', () => {
    const raw = '{"script":"line one\nline two", "n":2}';
    expect(safeParseJson<{ script: string; n: number }>(raw, { script: '', n: 0 }))
      .toEqual({ script: 'line one\nline two', n: 2 });
  });

  it('repairs trailing commas', () => {
    expect(safeParseJson('{"a":1,"b":2,}', {})).toEqual({ a: 1, b: 2 });
    expect(safeParseJson('[1,2,3,]', [])).toEqual([1, 2, 3]);
  });
});
