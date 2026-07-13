import { GOLD_EXAMPLES, FewShotExample, FewShotFunction, FewShotLanguage } from './goldExamples';
import type { LanguagePolicy } from '@/lib/llm/language/LanguagePolicy';

export * from './goldExamples';

/** Maps a resolved LanguagePolicy to the exemplar language bank to draw from. */
function bankFor(policy: Pick<LanguagePolicy, 'mode'>): FewShotLanguage {
  if (policy.mode === 'hindi' || policy.mode === 'hinglish') return 'hinglish';
  // 'multilingual' agents still lead in English by default; Hinglish lines are
  // added below so the model sees both registers.
  return 'english';
}

export interface SelectFewShotsOptions {
  policy: Pick<LanguagePolicy, 'mode'>;
  /** Restrict to these functions; omit for a representative spread. */
  functions?: FewShotFunction[];
  /** Max examples to return (keeps the prompt lean / on budget). Default 8. */
  limit?: number;
}

export function selectFewShots(opts: SelectFewShotsOptions): FewShotExample[] {
  const primary = bankFor(opts.policy);
  const langs: FewShotLanguage[] =
    opts.policy.mode === 'multilingual' ? ['english', 'hinglish'] : [primary];

  let pool = GOLD_EXAMPLES.filter((e) => langs.includes(e.language));
  if (opts.functions && opts.functions.length > 0) {
    const wanted = new Set(opts.functions);
    pool = pool.filter((e) => wanted.has(e.fn));
  }
  return pool.slice(0, opts.limit ?? 8);
}

/** Renders selected exemplars as a compact STYLE EXEMPLARS block for a prompt. */
export function renderFewShots(examples: FewShotExample[]): string {
  if (examples.length === 0) return '';
  const lines = examples.map((e) => `- (${e.fn}) ${e.text}`).join('\n');
  return `\nSTYLE EXEMPLARS — match this register, tone, and code-mix ratio. Paraphrase naturally; NEVER copy verbatim:\n${lines}`;
}

/** Convenience: select + render in one call. Returns '' when nothing matches. */
export function fewShotBlock(opts: SelectFewShotsOptions): string {
  return renderFewShots(selectFewShots(opts));
}
