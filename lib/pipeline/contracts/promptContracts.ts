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
import { lintPrompt, type LintFinding } from "@/lib/pipeline/dialogue/dialogueLint";

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
  check: ({ prompt }) => lintPrompt(prompt).map((f: LintFinding) => ({
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

/** Explicit prohibitions the user stated must survive into the prompt. */
const prohibitionsPresent: Contract = {
  id: 'prohibitions_present',
  description: 'Every explicit user prohibition is reflected in the prompt.',
  check: ({ prompt, spec }) => {
    const prohibitions = (spec.guardrails as { prohibitions?: string[] } | undefined)?.prohibitions;
    if (!Array.isArray(prohibitions) || prohibitions.length === 0) return [];
    const lower = prompt.toLowerCase();
    return prohibitions
      .filter(p => {
        const key = String(p || '').toLowerCase();
        if (key.length < 8) return false;
        // Match on the prohibition's distinctive words rather than the full string,
        // since the prompt legitimately rephrases it.
        const words = key.split(/\s+/).filter(w => w.length > 5);
        if (words.length === 0) return false;
        return !words.some(w => lower.includes(w));
      })
      .map(p => ({
        contract: 'prohibitions_present',
        severity: 'major' as const,
        category: 'missing' as const,
        description: 'A prohibition the user stated is not reflected anywhere in the prompt.',
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
