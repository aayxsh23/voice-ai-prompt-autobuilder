/**
 * Universal prompt contracts.
 *
 * These are invariants that hold for EVERY voice agent, in every domain and
 * language. They exist so that quality is enforced once, declaratively, instead of
 * by a new regex patch each time a use case breaks.
 *
 * Consumed by two callers so a contract written once protects both:
 *   - PromptJudge (production) — as deterministic backstops, free and reliable.
 *   - The contract harness (CI)  — as the anti-overfitting gate across fixtures.
 *
 * Rules for adding a contract: it must be true for a dental clinic, an outbound
 * cross-sell agent, and a Hindi ERP demo bot alike. Anything domain-specific
 * belongs in a fixture's expectations, not here.
 */

import type { BusinessSpecification, ChatMessage } from "@/lib/llm/types";
import { lintPrompt, extractSpokenLines, type LintFinding } from "@/lib/pipeline/dialogue/dialogueLint";
import { containsDevanagari, type LanguagePolicy } from "@/lib/llm/language/LanguagePolicy";
import { validateLanguageQuality } from "@/lib/pipeline/validators/LanguageQualityValidator";

export type ContractSeverity = 'critical' | 'major' | 'minor';

export type ContractCategory =
  | 'language' | 'missing' | 'extra' | 'incorrect'
  | 'coverage' | 'persona' | 'dialogue' | 'tooling' | 'locale';

export interface ContractViolation {
  contract: string;
  severity: ContractSeverity;
  category: ContractCategory;
  description: string;
  evidence?: string;
  whereInPrompt?: string;
  suggestedFix: string;
}

export interface ContractInput {
  prompt: string;
  spec: Partial<BusinessSpecification>;
  transcript?: ChatMessage[];
  /** Resolved language/persona policy. Contracts that need it no-op when absent. */
  policy?: LanguagePolicy;
}

export interface Contract {
  id: string;
  description: string;
  check: (input: ContractInput) => ContractViolation[];
}

const SECTION_RE = /^###\s+(.+)$/gm;
function sections(prompt: string): string[] {
  return Array.from(prompt.matchAll(SECTION_RE)).map(m => m[1].trim());
}

/** Spoken lines + state directives, i.e. everything the flow actually contains. */
function callFlowBlock(prompt: string): string {
  const idx = prompt.indexOf('### CALL FLOW');
  if (idx === -1) return '';
  const rest = prompt.slice(idx);
  const next = rest.indexOf('\n### ', 5);
  return next === -1 ? rest : rest.slice(0, next);
}

// ── Contracts ────────────────────────────────────────────────────────────────

/**
 * Every stage the user described must exist as a state. This is what catches an
 * agent whose entire purpose (a pitch, a triage, a verification) never made it
 * into the flow. No-ops when the interview did not capture stages.
 */
const stageCoverage: Contract = {
  id: 'stage_coverage',
  description: 'Every required call-flow stage maps to a state.',
  check: ({ prompt, spec }) => {
    const stages = (spec.callFlowPlan as { requiredStages?: Array<{ id: string; label?: string }> } | undefined)?.requiredStages;
    if (!Array.isArray(stages) || stages.length === 0) return [];
    // Compare on alphanumerics only, so "cross_sell_pitch", "Cross-sell pitch" and
    // "crossSellPitch" all match regardless of how the planner spelled the state.
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const flowNorm = norm(callFlowBlock(prompt));
    const stepTokens = (spec.callFlowPlan?.steps || []).map(s =>
      norm(`${s.stateId || ''} ${s.stateName || ''} ${s.objective || ''}`));
    return stages
      .filter(stage => {
        const token = norm(stage?.id || '');
        if (!token) return false;
        return !stepTokens.some(t => t.includes(token)) && !flowNorm.includes(token);
      })
      .map(stage => ({
        contract: 'stage_coverage',
        severity: 'critical' as const,
        category: 'coverage' as const,
        description: `Required call-flow stage "${stage.label || stage.id}" has no corresponding state in the CALL FLOW.`,
        evidence: `Stage declared in the interview: ${stage.id}`,
        whereInPrompt: 'absent',
        suggestedFix: `Add a state implementing "${stage.label || stage.id}" in flow order.`,
      }));
  },
};

/** Dialogue-quality contract; delegates to the shared linter. */
const dialogueQuality: Contract = {
  id: 'dialogue_quality',
  description: 'Spoken lines read like a person, never like a builder instruction.',
  check: ({ prompt, spec }) => lintPrompt(prompt, {
    // Everything the builder named internally. Passing these lets the linter catch
    // identifiers spoken in their de-underscored form ("caller intent"), which the
    // regex alone cannot see.
    internalTerms: [
      ...(spec.callFlowPlan?.steps || []).flatMap(s => [
        s.stateId || '',
        ...(Array.isArray(s.slotsToCollect) ? s.slotsToCollect : []),
      ]),
      ...((spec.callFlowPlan as { requiredStages?: Array<{ id: string; label?: string }> } | undefined)?.requiredStages || [])
        .flatMap(st => [st.id || '', st.label || '']),
      ...(spec.dynamicVariables || []).map(v => v.key || ''),
    ].filter(Boolean),
  }).map((f: LintFinding) => ({
    contract: `dialogue:${f.rule}`,
    severity: f.severity,
    category: 'dialogue' as const,
    description: f.message,
    evidence: f.line,
    whereInPrompt: 'CALL FLOW dialogue',
    suggestedFix: f.suggestion,
  })),
};

/** Every {{placeholder}} must be a declared variable. */
const placeholdersDeclared: Contract = {
  id: 'placeholders_declared',
  description: 'No undeclared {{placeholder}} appears in the prompt.',
  check: ({ prompt, spec }) => {
    const declared = new Set((spec.dynamicVariables || []).map(v => v.key).filter(Boolean));
    const used = new Set(Array.from(prompt.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)).map(m => m[1]));
    return Array.from(used)
      .filter(k => !declared.has(k))
      .map(k => ({
        contract: 'placeholders_declared',
        severity: 'major' as const,
        category: 'incorrect' as const,
        description: `Prompt references {{${k}}}, which is not a declared dynamic variable.`,
        evidence: `{{${k}}}`,
        whereInPrompt: 'DYNAMIC VARIABLES / dialogue',
        suggestedFix: `Declare ${k} as an infield or stop referencing it.`,
      }));
  },
};

/** Interview answers that were captured must actually reach the prompt. */
const policiesRendered: Contract = {
  id: 'policies_rendered',
  description: 'Captured call-flow policies are rendered, not silently dropped.',
  check: ({ prompt, spec }) => {
    const plan = spec.callFlowPlan;
    if (!plan) return [];
    const declared: Array<[string, unknown]> = [
      ['silence handling', plan.silenceHandling],
      ['interruption policy', plan.interruptionPolicy],
      ['digression policy', plan.digressionPolicy],
      ['confirmation style', plan.confirmationStyle],
      ['DTMF fallback', plan.dtmfFallback],
    ];
    const anyDeclared = declared.some(([, v]) => v !== undefined && v !== null);
    if (!anyDeclared) return [];
    if (prompt.includes('CONVERSATIONAL & CALL FLOW POLICIES')) return [];
    return [{
      contract: 'policies_rendered',
      severity: 'major' as const,
      category: 'missing' as const,
      description: 'Call-flow policies were captured from the interview but no policies section was rendered.',
      evidence: declared.filter(([, v]) => v).map(([k]) => k).join(', '),
      whereInPrompt: 'absent',
      suggestedFix: 'Render the captured policies in the CALL FLOW section.',
    }];
  },
};

/** Region-specific facts require an established region. */
const localeGrounded: Contract = {
  id: 'locale_grounded',
  description: 'No region-specific emergency number unless the region is known.',
  check: ({ prompt, spec }) => {
    const region = (spec.meta as { region?: string } | undefined)?.region?.toUpperCase();
    const NUMBERS: Array<[RegExp, string]> = [
      [/\b911\b/, 'US'], [/\b988\b/, 'US'],
      [/\b112\b/, 'IN'], [/\b999\b/, 'QA'], [/\b997\b/, 'SA'], [/\b998\b/, 'AE'],
    ];
    return NUMBERS.filter(([re, owner]) => re.test(prompt) && region !== owner)
      .map(([re, owner]) => ({
        contract: 'locale_grounded',
        severity: 'critical' as const,
        category: 'locale' as const,
        description: region
          ? `Prompt cites the ${owner} emergency number but the deployment region is ${region}.`
          : `Prompt cites a ${owner} emergency number but no deployment region was established.`,
        evidence: String(re),
        whereInPrompt: 'MANDATORY EMERGENCY & SAFETY OVERRIDES',
        suggestedFix: 'Direct callers to local emergency services unless the region is known.',
      }));
  },
};

/** Only tools the platform registered may be instructed. */
const toolsRegistered: Contract = {
  id: 'tools_registered',
  description: 'Prompt instructs only registered tools.',
  check: ({ prompt, spec }) => {
    const registered = new Set((spec.tools || []).map(t => t?.name).filter(Boolean));
    if (registered.size === 0) return [];
    const invoked = new Set(
      Array.from(prompt.matchAll(/`([a-z][a-z0-9_]*)\(/g)).map(m => m[1]),
    );
    return Array.from(invoked)
      .filter(name => !registered.has(name))
      .map(name => ({
        contract: 'tools_registered',
        severity: 'critical' as const,
        category: 'tooling' as const,
        description: `Prompt instructs \`${name}()\`, which is not a registered tool.`,
        evidence: `${name}(`,
        whereInPrompt: 'Required Tool Actions',
        suggestedFix: `Register ${name} or remove the instruction — the platform cannot execute it.`,
      }));
  },
};

/** A declared infield that is never used is a requirement silently dropped. */
const infieldsReferenced: Contract = {
  id: 'infields_referenced',
  description: 'Every declared infield is referenced somewhere in the prompt.',
  check: ({ prompt, spec }) => {
    const infields = (spec.dynamicVariables || []).filter(v => v?.fieldDirection === 'infield' && v.key);
    if (infields.length === 0) return [];
    return infields
      .filter(v => !prompt.includes(`{{${v.key}}}`))
      .map(v => ({
        contract: 'infields_referenced',
        severity: 'major' as const,
        category: 'coverage' as const,
        description: `Infield {{${v.key}}} is provided before the call but never referenced in the prompt.`,
        evidence: v.key,
        whereInPrompt: 'absent',
        suggestedFix: `Use {{${v.key}}} where it changes behaviour, or stop declaring it.`,
      }));
  },
};

/**
 * Every prohibition we know about: those extracted into the spec, plus any the user
 * stated in the transcript that extraction may have missed.
 */
export function collectProhibitions(
  spec: Partial<BusinessSpecification>,
  transcript?: ChatMessage[],
): string[] {
  const fromSpec = Array.isArray((spec.guardrails as { prohibitions?: string[] } | undefined)?.prohibitions)
    ? (spec.guardrails as { prohibitions: string[] }).prohibitions.map(String)
    : [];
  const fromTranscript: string[] = [];
  if (transcript?.length) {
    const userText = transcript.filter(m => m.role.toLowerCase() === 'user').map(m => m.content).join(' ');
    for (const m of userText.matchAll(/\b(?:never|don'?t|do not|no)\s+([a-z0-9\s\-_]{3,60})(?=\.|,|$|\n|because|when|if|while|over|in|during|to)/gi)) {
      const phrase = m[0].trim();
      if (phrase.length > 4 && !/never mind|don'?t know|no problem|no worries|don'?t think/i.test(phrase)) {
        fromTranscript.push(phrase);
      }
    }
  }
  return Array.from(new Set([...fromSpec, ...fromTranscript])).filter(Boolean);
}

// Words too common to prove a prohibition survived — they appear in every prompt.
const PRESENCE_STOP_WORDS = new Set([
  'never', 'dont', "don't", 'do', 'not', 'no', 'say', 'tell', 'ask', 'give', 'share',
  'speak', 'about', 'with', 'from', 'that', 'this', 'have', 'been', 'will', 'your',
  'the', 'and', 'any', 'call', 'caller', 'agent', 'customer', 'details', 'information',
]);

/**
 * Explicit prohibitions must survive into the prompt — that is how the agent learns
 * the rule. NOTE: presence is COMPLIANCE, not violation. Flagging a prohibition's
 * keywords as a breach would flag exactly the prompts that obey it.
 */
const prohibitionsPresent: Contract = {
  id: 'prohibitions_present',
  description: 'Every explicit user prohibition is reflected in the prompt.',
  check: ({ prompt, spec, transcript }) => {
    const prohibitions = collectProhibitions(spec, transcript);
    if (prohibitions.length === 0) return [];
    const lower = prompt.toLowerCase();
    return prohibitions
      .filter(p => {
        const words = String(p).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
          .filter(w => w.length >= 4 && !PRESENCE_STOP_WORDS.has(w));
        if (words.length === 0) return false;
        return !words.some(w => lower.includes(w));
      })
      .map(p => ({
        contract: 'prohibitions_present',
        severity: 'major' as const,
        category: 'missing' as const,
        description: `A prohibition the user stated is not reflected anywhere in the prompt: "${p}".`,
        evidence: String(p),
        whereInPrompt: 'absent',
        suggestedFix: `Add this prohibition to SCOPE & REFUSAL BEHAVIOR: "${p}"`,
      }));
  },
};

/** The canonical safety block is non-negotiable in every prompt. */
const safetyBlockPresent: Contract = {
  id: 'safety_block_present',
  description: 'The mandatory safety/emergency section is always present.',
  check: ({ prompt }) => {
    if (sections(prompt).some(s => /EMERGENCY & SAFETY OVERRIDES/i.test(s))) return [];
    return [{
      contract: 'safety_block_present',
      severity: 'critical' as const,
      category: 'missing' as const,
      description: 'The mandatory emergency/safety override section is missing.',
      whereInPrompt: 'absent',
      suggestedFix: 'Restore the canonical safety section; it is required for every agent.',
    }];
  },
};

const ROMANIZED_HINDI = /\b(hai|hain|kya|aap|kar|rahi|raha|hoon|hun|nahi|haan|namaste|kaise|kripya|dhanyavaad|bataye|bataiye|kijiye|karein|chahiye|milega|milenge|sakti|sakta|acha|accha|theek|madad)\b/i;

/** The declared language must actually be the language of the dialogue. */
const languageHonoured: Contract = {
  id: 'language_honoured',
  description: 'Dialogue is written in the declared language and script.',
  check: ({ prompt, policy }) => {
    if (!policy) return [];
    const out: ContractViolation[] = [];
    const hasDevanagari = containsDevanagari(prompt);

    if (policy.script === 'devanagari') {
      if (!hasDevanagari) {
        out.push({
          contract: 'language_honoured', severity: 'critical', category: 'language',
          description: `User requested ${policy.mode} mode (${policy.script} script), but the dialogue is pure English/Latin.`,
          evidence: `languageMode=${policy.mode}, targetTTS=${policy.targetTTS}`,
          whereInPrompt: 'Spoken dialogue across all states',
          suggestedFix: `Translate all Say: lines into ${policy.mode} using Devanagari. Keep English domain terms (demo, software, WhatsApp) in Latin script.`,
        });
      } else {
        const q = validateLanguageQuality(prompt, policy);
        for (const warn of q.warnings || []) {
          if (/Romanized Hindi in a Devanagari line|more romanized-Hindi line/.test(warn)) {
            out.push({
              contract: 'language_honoured', severity: 'critical', category: 'language',
              description: warn,
              evidence: `languageMode=${policy.mode} (${policy.script})`,
              whereInPrompt: 'Spoken dialogue lines',
              suggestedFix: 'Rewrite romanized Hindi into Devanagari, keeping English domain terms in Latin.',
            });
          }
        }
      }
    } else if (policy.mode === 'hinglish' && policy.script === 'latin') {
      if (!ROMANIZED_HINDI.test(prompt) && !hasDevanagari) {
        out.push({
          contract: 'language_honoured', severity: 'critical', category: 'language',
          description: 'User requested Hinglish mode, but the dialogue is pure English.',
          evidence: 'languageMode=hinglish',
          whereInPrompt: 'Say: lines across all states',
          suggestedFix: 'Rewrite the Say: lines into conversational Hinglish (Latin script).',
        });
      }
    }
    return out;
  },
};

/** The AI-disclosure decision must not be inverted. */
const aiDisclosureHonoured: Contract = {
  id: 'ai_disclosure_honoured',
  description: 'Prompt matches the configured AI-disclosure stance.',
  check: ({ prompt, spec, policy }) => {
    const stance = policy?.aiDisclosure || (spec.meta as { aiDisclosure?: string } | undefined)?.aiDisclosure;
    if (!stance) return [];
    if (stance === 'deny' && /\b(ai assistant|virtual assistant|artificial intelligence|i am an ai|as an ai)\b/i.test(prompt)) {
      return [{
        contract: 'ai_disclosure_honoured', severity: 'critical', category: 'persona',
        description: 'Deployment requires the agent NOT to disclose it is an AI, but the prompt calls it an AI assistant.',
        evidence: 'aiDisclosure=deny', whereInPrompt: 'AGENT IDENTITY & PERSONA',
        suggestedFix: 'Remove AI self-identification and present the agent as a human representative.',
      }];
    }
    if (stance === 'disclose' && /\b(do not reveal you are an ai|deny you are an ai|never admit to being an ai)\b/i.test(prompt)) {
      return [{
        contract: 'ai_disclosure_honoured', severity: 'critical', category: 'persona',
        description: 'Deployment requires AI disclosure, but the prompt instructs the agent to deny being an AI.',
        evidence: 'aiDisclosure=disclose', whereInPrompt: 'AGENT IDENTITY & PERSONA',
        suggestedFix: 'Instruct the agent to disclose its AI identity when asked.',
      }];
    }
    return [];
  },
};

/** Hindi verb inflections must agree with the agent's configured gender. */
const agentGenderAgrees: Contract = {
  id: 'agent_gender_agrees',
  description: "Hindi verb inflections match the agent's gender.",
  check: ({ prompt, policy }) => {
    if (!policy) return [];
    if (policy.script !== 'devanagari' && !containsDevanagari(prompt)) return [];
    const mk = (desc: string, fix: string): ContractViolation => ({
      contract: 'agent_gender_agrees', severity: 'major', category: 'persona',
      description: desc, evidence: `agentGender=${policy.agentGender}`,
      whereInPrompt: 'Agent self-reference dialogue', suggestedFix: fix,
    });
    if (policy.agentGender === 'male' && /(रही|सकती|करती|लेती|गई)\s*हूँ/.test(prompt)) {
      return [mk('Agent is male, but feminine Hindi verb inflections are used (कर रही हूँ / कर सकती हूँ).',
        'Change feminine agent inflections to masculine (कर रहा हूँ / कर सकता हूँ).')];
    }
    if (policy.agentGender === 'female' && /(रहा|सकता|करता|लेता|गया)\s*हूँ/.test(prompt)) {
      return [mk('Agent is female, but masculine Hindi verb inflections are used (कर रहा हूँ / कर सकता हूँ).',
        'Change masculine agent inflections to feminine (कर रही हूँ / कर सकती हूँ).')];
    }
    return [];
  },
};

/**
 * A spoken line that quotes a real amount, when the user forbade quoting prices.
 * Matching the WORD "fee" would flag the compliant prompt (which states the rule);
 * matching a monetary AMOUNT inside a Say: line flags only an actual breach.
 */
const pricingProhibitionHonoured: Contract = {
  id: 'pricing_prohibition_honoured',
  description: 'No spoken line quotes a price when pricing is prohibited.',
  check: ({ prompt, spec, transcript }) => {
    const prohibitions = collectProhibitions(spec, transcript);
    if (!prohibitions.some(p => /\b(fee|fees|price|prices|pricing|cost|costs|discount|rate|rates|quote)\b/i.test(p))) return [];
    const MONEY = /(?:[$£€₹]\s?\d|\b(?:QAR|AED|SAR|USD|INR|GBP|EUR|Rs)\.?\s?\d|\b\d[\d,.]*\s?(?:dollars?|rupees?|riyals?|dirhams?|pounds?|euros?)\b|\b\d[\d,.]*\s?(?:per|a|an)\s+(?:hour|month|session|year|visit|person)\b)/i;
    const offending = extractSpokenLines(prompt).find(l => MONEY.test(l));
    if (!offending) return [];
    const p = prohibitions.find(x => /\b(fee|price|pricing|cost|discount|rate|quote)\b/i.test(x)) || 'pricing prohibition';
    return [{
      contract: 'pricing_prohibition_honoured', severity: 'major', category: 'incorrect',
      description: `Spoken line quotes a price despite the prohibition "${p}".`,
      evidence: offending, whereInPrompt: `Dialogue: ${offending}`,
      suggestedFix: 'Remove the amount and defer cost questions per the prohibition.',
    }];
  },
};

/** A flow that collects payment/PII the user forbade. Structural, so unambiguous. */
const sensitiveCaptureProhibited: Contract = {
  id: 'sensitive_capture_prohibited',
  description: 'No state collects payment/PII the user prohibited.',
  check: ({ spec, transcript }) => {
    const prohibitions = collectProhibitions(spec, transcript);
    if (!prohibitions.some(p => /\b(payment|otp|bank|credit\s*card|debit\s*card|pii|national\s*id|qid|ssn|social\s*security|cvv)\b/i.test(p))) return [];
    const SENSITIVE = /(otp|cvv|card_number|credit_card|debit_card|bank_account|national_id|ssn|qid|passport)/i;
    return (spec.callFlowPlan?.steps || [])
      .flatMap(s => (Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : []).map(slot => ({ slot, stateId: s.stateId })))
      .filter(({ slot }) => SENSITIVE.test(String(slot)))
      .map(({ slot, stateId }) => ({
        contract: 'sensitive_capture_prohibited', severity: 'critical' as const, category: 'incorrect' as const,
        description: `Call flow collects "${slot}", but the user prohibited collecting payment/PII on the call.`,
        evidence: prohibitions.find(p => /payment|otp|bank|card|pii|national|qid|ssn/i.test(p)) || 'payment/PII prohibition',
        whereInPrompt: `state [${stateId}]`,
        suggestedFix: `Remove the state that collects "${slot}".`,
      }));
  },
};

export const PROMPT_CONTRACTS: Contract[] = [
  stageCoverage,
  dialogueQuality,
  placeholdersDeclared,
  policiesRendered,
  localeGrounded,
  toolsRegistered,
  infieldsReferenced,
  prohibitionsPresent,
  safetyBlockPresent,
  languageHonoured,
  aiDisclosureHonoured,
  agentGenderAgrees,
  pricingProhibitionHonoured,
  sensitiveCaptureProhibited,
];

/** Runs every contract. Pure, deterministic, no LLM, no network. */
export function checkContracts(input: ContractInput): ContractViolation[] {
  return PROMPT_CONTRACTS.flatMap(c => {
    try {
      return c.check(input);
    } catch {
      return [];
    }
  });
}

export function contractScore(violations: ContractViolation[]): number {
  const w = { critical: 25, major: 10, minor: 2 } as const;
  return Math.max(0, Math.min(100, 100 - violations.reduce((s, v) => s + w[v.severity], 0)));
}
