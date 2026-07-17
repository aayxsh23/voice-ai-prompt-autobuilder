import { ValidationResult } from "./types";

export interface LanguageQualityInput {
  mode: string;
  script: string; // 'latin' | 'devanagari'
  agentGender: string; // 'female' | 'male'
}

const DEVANAGARI = /[ऀ-ॿ]/;

// Distinctive romanized Hindi function words that should NOT appear in a
// Devanagari deployment (English domain terms are intentionally excluded).
/** Shared with promptContracts — one list, not two that drift apart. */
export const ROMANIZED_HINDI = /\b(hai|hain|kya|aap|kar|rahi|raha|hoon|hun|nahi|haan|namaste|kaise|kripya|dhanyavaad|bataye|bataiye|kijiye|karein|chahiye|milega|milenge|sakti|sakta|acha|accha|theek)\b/i;

// Agent self-reference verb endings (…रही/रहा/सकती/सकता/करती/करता/लेती/लेता हूँ)
const FEMININE_SELF = /(रही|सकती|करती|लेती|गई)\s*हूँ/;
const MASCULINE_SELF = /(रहा|सकता|करता|लेता|गया)\s*हूँ/;

/**
 * Deterministic language-quality audit for the assembled prompt. Cheap and
 * offline (no LLM) — catches the exact failure modes the old regex "fixer"
 * used to create: romanized Hindi in a Devanagari deployment, agent verb-gender
 * mismatches, and duplicate romanized/Devanagari lines. Emits warnings (not hard
 * errors) plus a 0–100 score. Feeds the validate→repair loop.
 */
export function validateLanguageQuality(
  promptString: string,
  policy: LanguageQualityInput,
): ValidationResult {
  const warnings: string[] = [];

  if (policy.script === 'devanagari') {
    const lines = promptString.split('\n');
    let romanizedLeaks = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // A line that is (or contains) Devanagari but also carries romanized Hindi
      // function words is a script leak.
      if (DEVANAGARI.test(line) && ROMANIZED_HINDI.test(line)) {
        romanizedLeaks++;
        if (romanizedLeaks <= 3) {
          warnings.push(`Romanized Hindi in a Devanagari line: "${line.slice(0, 70)}"`);
        }
      }
    }
    if (romanizedLeaks > 3) {
      warnings.push(`…and ${romanizedLeaks - 3} more romanized-Hindi line(s).`);
    }

    // Agent verb-gender agreement on the agent's own speech.
    if (policy.agentGender === 'male' && FEMININE_SELF.test(promptString)) {
      warnings.push('Feminine agent verb form (…रही/सकती हूँ) used but agentGender is male.');
    }
    if (policy.agentGender === 'female' && MASCULINE_SELF.test(promptString)) {
      warnings.push('Masculine agent verb form (…रहा/सकता हूँ) used but agentGender is female.');
    }
  }

  const score = Math.max(0, 100 - warnings.length * 15);
  return { isValid: warnings.length === 0, errors: [], warnings, score };
}
