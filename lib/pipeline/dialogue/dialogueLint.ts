/**
 * Domain-agnostic dialogue linting for voice-agent prompts.
 *
 * This exists so quality is enforced by *rules that hold for every use case*
 * rather than by per-domain templates or per-case regex patches. Nothing here
 * knows about dentists, ERP demos, or cross-sell — it only knows what a human
 * sounds like on a phone call.
 *
 * Severity policy:
 *  - STRUCTURAL rules hard-fail (critical/major): a spoken line that is really a
 *    builder instruction, leaks an internal field name, or stacks two questions
 *    is wrong in every domain.
 *  - LEXICAL rules warn only (minor): "robust" is an AI tell for a clinic and
 *    legitimate vocabulary for an engineering client, so these must never block.
 */

export type LintSeverity = 'critical' | 'major' | 'minor';

export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  line: string;
  message: string;
  suggestion: string;
}

/** Pulls the literal spoken lines out of an assembled prompt (`Say: "..."`). */
export function extractSpokenLines(prompt: string): string[] {
  if (!prompt) return [];
  return Array.from(prompt.matchAll(/Say:\s*"([^"]+)"/g)).map(m => m[1].trim()).filter(Boolean);
}

/** Strips placeholders so they are not mistaken for prose. */
function stripPlaceholders(line: string): string {
  return line.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\[[^\]]*\]/g, ' ');
}

// A spoken line that opens with a builder-facing imperative is an instruction that
// leaked into dialogue (e.g. `Say: "Accept immediately, apologize, and close"`).
const BUILDER_OPENER =
  /^(?:politely\s+|immediately\s+|then\s+)?(accept|apologi[sz]e|acknowledge|issue|deliver|read\s+back|redirect|wrap\s+up|terminate|defer|escalate|decline|do\s+not\s+attempt|don'?t\s+attempt)\b/i;

// Talking *about* the conversation rather than *having* it. A real agent says
// "you", never "the caller"; and never narrates "end the call".
const META_PHRASE =
  /\b(the\s+(?:call|caller|user)\b|end\s+the\s+call|close\s+the\s+call|re-?pitch(?:ing)?|de-?escalat\w*|max(?:imum)?\s+retries|failed\s+attempts|the\s+agent\b|without\s+re-?pitching)/i;

/**
 * True when `text` reads as an instruction to the builder rather than words the
 * agent speaks. Exported so generators can refuse to wrap it in `Say: "..."`.
 */
export function isInstructionLike(text: string): boolean {
  if (!text) return false;
  const t = text.replace(/^Say:\s*"?|"$/g, '').trim();
  if (!t) return false;
  return BUILDER_OPENER.test(t) || META_PHRASE.test(t);
}

// Encyclopedic "AI voice" vocabulary (per Wikipedia:Signs of AI writing) plus the
// call-centre-bot register. Warn-only: any of these can be legitimate in context.
const AI_LEXICON = /\b(delve|boasts?|testament|robust|meticulous(?:ly)?|showcase|tapestry|landscape|pivotal|underscore[sd]?|foster(?:ing)?|garner|vibrant|seamless(?:ly)?|elevate|embark|intricate|interplay|bolster(?:ed)?)\b/i;

const CANNED_ASSISTANT =
  /\b(I'?d be happy to|I am happy to assist|certainly!|absolutely!|great question|rest assured|please don'?t hesitate|at your earliest convenience|is there anything else I can (?:help|assist) you with)/i;

const NEGATIVE_PARALLELISM = /\bnot\s+(?:just|only)\b[^.?!]*\bbut\s+(?:also\s+)?\b/i;
const COPULA_AVOIDANCE = /\b(serves as|stands as|represents a)\b/i;
// Em dash and curly quotes: an AI tell, and both can mis-render in TTS.
const TTS_HAZARD = /[—“”‘’]/;

const INTERNAL_FIELD = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

/** Lints one spoken line. Domain-agnostic by construction. */
export function lintDialogueLine(line: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const raw = (line || '').trim();
  if (!raw) return findings;
  const bare = stripPlaceholders(raw);

  if (isInstructionLike(raw)) {
    findings.push({
      rule: 'instruction_as_speech',
      severity: 'critical',
      line: raw,
      message: 'Spoken line is a builder instruction; the agent would read it aloud to the caller.',
      suggestion: 'Move the instruction to behaviorDirective and write an actual spoken sentence for scriptDirective.',
    });
  }

  const toolLeak = bare.match(/\b(?:end_call|check_calendar|book_appointment|validate_digit_input|set_capture_mode|lookup_order|transfer_call|escalate_to_human|format_email|invoke_tool|call_tool|execute_tool|run_tool)\b/i);
  if (toolLeak) {
    findings.push({
      rule: 'tool_name_leak',
      severity: 'major',
      line: raw,
      message: `Spoken line leaks tool name or invocation syntax ("${toolLeak[0]}").`,
      suggestion: `Speak naturally as a human agent without saying tool names or function identifiers aloud.`,
    });
  }

  const field = bare.match(INTERNAL_FIELD);
  if (field) {
    findings.push({
      rule: 'internal_field_name',
      severity: 'major',
      line: raw,
      message: `Spoken line contains the internal field name "${field[0]}".`,
      suggestion: `Ask for it the way a person would; never say "${field[0]}" out loud.`,
    });
  }

  if ((raw.match(/\?/g) || []).length >= 2) {
    findings.push({
      rule: 'stacked_questions',
      severity: 'major',
      line: raw,
      message: 'Two or more questions in a single turn.',
      suggestion: 'Ask exactly one question per turn; move the rest to a later state.',
    });
  }

  if (bare.split(/\s+/).filter(Boolean).length > 25) {
    findings.push({
      rule: 'overlong_turn',
      severity: 'minor',
      line: raw,
      message: 'Spoken turn is long for a phone call (>25 words).',
      suggestion: 'Keep turns to 1-2 short sentences.',
    });
  }

  const lex = bare.match(AI_LEXICON);
  if (lex) {
    findings.push({
      rule: 'ai_lexicon',
      severity: 'minor',
      line: raw,
      message: `Uses AI-register vocabulary ("${lex[0]}").`,
      suggestion: 'Prefer the plain word a person would actually say.',
    });
  }

  const canned = bare.match(CANNED_ASSISTANT);
  if (canned) {
    findings.push({
      rule: 'canned_assistant',
      severity: 'minor',
      line: raw,
      message: `Uses canned assistant phrasing ("${canned[0].trim()}").`,
      suggestion: 'Respond naturally instead of using stock assistant filler.',
    });
  }

  if (NEGATIVE_PARALLELISM.test(bare)) {
    findings.push({
      rule: 'negative_parallelism',
      severity: 'minor',
      line: raw,
      message: 'Uses "not just X but Y" construction, a common AI-writing tell.',
      suggestion: 'State the point directly.',
    });
  }

  if (COPULA_AVOIDANCE.test(bare)) {
    findings.push({
      rule: 'copula_avoidance',
      severity: 'minor',
      line: raw,
      message: 'Avoids a plain "is/are" ("serves as", "stands as").',
      suggestion: 'Use the simple verb.',
    });
  }

  if (TTS_HAZARD.test(raw)) {
    findings.push({
      rule: 'tts_hazard',
      severity: 'minor',
      line: raw,
      message: 'Contains an em dash or curly quote, which can mis-render in TTS.',
      suggestion: 'Use plain ASCII punctuation in spoken lines.',
    });
  }

  return findings;
}

/** Lints every spoken line in an assembled prompt. */
export function lintPrompt(prompt: string): LintFinding[] {
  return extractSpokenLines(prompt).flatMap(lintDialogueLine);
}

/** 0-100; structural problems dominate, lexical nits barely move it. */
export function dialogueScore(findings: LintFinding[]): number {
  const w = { critical: 25, major: 10, minor: 2 } as const;
  const penalty = findings.reduce((sum, f) => sum + w[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
