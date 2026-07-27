import { assembleUnifiedPrompt, resolveRegion } from "../compiler/assembler/PromptAssembler";
import { getLlmClient } from "../llm/llmClient";

import {
  BlueprintJson,
  PromptPackageDraft,
  SchemaOverrides,
  BusinessSpecification,

  CallMission,
  DynamicVariableSpec,
  ChatMessage,
} from "../llm/types";
import type { PromptRule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { validateVariableConsistency } from "@/lib/pipeline/validators/VariableConsistencyValidator";
import { validateFallbackDialogue } from "@/lib/pipeline/validators/FallbackDialogueValidator";
import { validateCoherence } from "@/lib/pipeline/validators/CoherenceValidator";
import { validateFlowCompleteness } from "@/lib/pipeline/validators/FlowCompletenessValidator";
import { validatePromptBudget } from "@/lib/pipeline/validators/PromptBudgetValidator";
import { validateLanguageQuality } from "@/lib/pipeline/validators/LanguageQualityValidator";
import { resolveLanguagePolicy } from "@/lib/llm/language/LanguagePolicy";
import { WorkflowArchitect } from "../compiler/planners/WorkflowArchitect";
import { KnowledgeArchitect } from "../compiler/planners/KnowledgeArchitect";
import { ToolPlanner } from "../compiler/planners/ToolPlanner";
import { GuardrailOptimizer } from "../compiler/planners/GuardrailOptimizer";
import { judgePrompt, repairFromJudge } from "./judge/PromptJudge";
import { JUDGE_ENABLED, JUDGE_MAX_ROUNDS, JUDGE_TIME_BUDGET_MS, JUDGE_HARD_GATE } from "@/lib/config";

function resolveVariables(
  specVars: DynamicVariableSpec[] = [],
  inputVars: DynamicVariableSpec[] = [],
  overrideVars: DynamicVariableSpec[] = []
): DynamicVariableSpec[] {
  const map = new Map<string, DynamicVariableSpec>();
  specVars.forEach(v => v.key && map.set(v.key, v));
  inputVars.forEach(v => v.key && map.set(v.key, v));
  overrideVars.forEach(v => v.key && map.set(v.key, v));
  return Array.from(map.values());
}
function structurePreserved(newPrompt: string, oldPrompt: string): boolean {
  if (!newPrompt || !oldPrompt) return false;
  const newTrimmed = newPrompt.trim();
  const oldTrimmed = oldPrompt.trim();
  if (newTrimmed.length < oldTrimmed.length * 0.6 || newTrimmed.length > oldTrimmed.length * 1.6) {
    return false;
  }
  const oldHeaders = oldTrimmed.match(/^###\s+.+/gm) || [];
  const newHeadersSet = new Set(newTrimmed.match(/^###\s+.+/gm) || []);
  return oldHeaders.every(h => newHeadersSet.has(h));
}

/**
 * Rebuilds the call flow when the judge finds a STRUCTURAL problem — a required
 * stage with no state, i.e. the agent's purpose missing from the flow.
 *
 * Text repair cannot fix this: the flow is generated from `spec.callFlowPlan.steps`
 * by the planner, so editing the rendered prompt would desync the two (and is why a
 * missing stage previously had to be patched by hand). Re-planning and re-assembling
 * keeps the spec and the prompt in agreement.
 */
async function repairStructurally(
  spec: BusinessSpecification,
  draft: PromptPackageDraft,
  issues: Array<{ description: string; suggestedFix: string }>,
): Promise<string> {
  logger.info('compilePromptPackage: structural repair — re-planning the call flow', {
    issues: issues.map(i => i.description),
  });
  // Clearing steps forces a full re-plan; requiredStages (which the planner enforces)
  // are what the missing stage will come back through.
  const replanSpec: BusinessSpecification = {
    ...spec,
    callFlowPlan: { ...spec.callFlowPlan, fsmStates: [] },
  };
  const fsmStates = await WorkflowArchitect.planWorkflow(replanSpec);
  if (Array.isArray(fsmStates) && fsmStates.length > 0) {
    spec.callFlowPlan.fsmStates = fsmStates;
  }
  return assembleUnifiedPrompt(spec, draft);
}

/**
 * Input accepted by the compiler. It is a (partial) blueprint plus a few fields
 * that arrive from the builder/CRM path but aren't part of the base blueprint.
 */
export type CompileInput = Partial<BlueprintJson> & {
  businessSpec?: BusinessSpecification;
  dynamicVariables?: DynamicVariableSpec[];
  extractedIR?: Record<string, unknown>;
  overrides?: SchemaOverrides & { dynamicVariables?: DynamicVariableSpec[] };
  transcript?: ChatMessage[];
  sessionId?: string;
};

function mergeUserOverrides(draft: PromptPackageDraft, overrides?: SchemaOverrides): PromptPackageDraft {
  if (!overrides) return draft;
  const userQuestions = new Set((Array.isArray(overrides.faqPairs) ? overrides.faqPairs : []).map(f => String(f?.question || '').toLowerCase().trim()).filter(Boolean));
  const dedupedFaqs = (Array.isArray(draft.faqCards) ? draft.faqCards : []).filter(f => f && !userQuestions.has(String(f?.question || '').toLowerCase().trim()));
  
  const userTriggers = new Set((Array.isArray(overrides.objectionPairs) ? overrides.objectionPairs : []).map(o => String(o?.trigger || o?.objection || '').toLowerCase().trim()).filter(Boolean));
  const dedupedObjs = (Array.isArray(draft.objectionCards) ? draft.objectionCards : []).filter(o => o && !userTriggers.has(String(o?.trigger || o?.objection || '').toLowerCase().trim()));
  return {
    ...draft,
    faqCards: [...(Array.isArray(overrides.faqPairs) ? overrides.faqPairs : []), ...dedupedFaqs],
    objectionCards: [...(Array.isArray(overrides.objectionPairs) ? overrides.objectionPairs : []), ...dedupedObjs],
    verbatimLines: [...(Array.isArray(overrides.verbatimLines) ? overrides.verbatimLines : []), ...(Array.isArray(draft.verbatimLines) ? draft.verbatimLines : [])],
    transferConditions: [...(Array.isArray(overrides.transferRules) ? overrides.transferRules : []), ...(Array.isArray(draft.transferConditions) ? draft.transferConditions : [])]
  };
}

function filterRelevantRules(rules: PromptRule[], spec: BusinessSpecification, draft: PromptPackageDraft): PromptRule[] {
  const contextObj = {
    meta: spec?.meta,
    snapshot: spec?.businessSnapshot,
    flow: spec?.callFlowPlan,
    kb: spec?.knowledgeBase,
    tools: spec?.tools,
    draftFlow: draft?.callFlowSteps,
    draftFaqs: draft?.faqCards,
    draftObjs: draft?.objectionCards,
    useCase: (draft as { useCase?: string })?.useCase || spec?.meta?.primaryGoal
  };
  // Exclude structural keys like "faqCards" or "faq_topic" from raw text matching
  const contentOnlyText = JSON.stringify(contextObj).replace(/"(?:faqCards|faq_topic|faqs)":/g, '').toLowerCase();

  return rules.filter(r => {
    const tag = (r.tag || '').toUpperCase();
    
    // Core foundational rules for voice AI integrity
    if (tag === 'NUMBER') {
      return true;
    }
    if (['HALLUCINATION', 'OUT_OF_SCOPE', 'ABUSIVE_USER', 'SAFETY_CRITICAL', 'ESCALATION'].includes(tag)) {
      return false; // Handled deterministically via canonical built-in sections in PromptAssembler to prevent duplicated guardrail blocks (Issue #1)
    }

    if (['INTERRUPTION', 'SILENCE'].includes(tag)) {
      return /\b(phone|call|caller|voice|agent|speak|transfer|hang up)\b/.test(contentOnlyText);
    }
    if (tag === 'DATE_TIME') {
      return /\b(date|time|schedule|booking|reschedule|appointment|calendar|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\bam\b|\bpm\b|hours|mins|minutes)\b/.test(contentOnlyText);
    }
    if (tag === 'URL') {
      // Must contain actual web URLs or domain names, NOT merely the word "website"
      return /\b(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|io|co|gov|edu|uk)\b)/i.test(contentOnlyText);
    }
    if (tag === 'ADDRESS') {
      // Must contain an actual street address with number and street designator
      return /\b\d{1,5}\s+[a-z0-9\s]+(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|suite|ste)\b/i.test(contentOnlyText);
    }
    if (tag === 'ACRONYM') {
      // Technical acronyms (excluding structural 'faq')
      return /\b(ppo|hmo|fsa|hsa|hipaa|dtmf|ivr|vip|otp|ssn|dob|atm)\b/.test(contentOnlyText);
    }
    if (tag === 'NAME_PRONUNCIATION') {
      return /\b(dr\.|doctor|dentist|hygienist|phonetic|pronounce|pronunciation|provider|adams|lee|sarah)\b/.test(contentOnlyText);
    }

    // Context-dependent Guardrails
    if (tag === 'SAFETY_CRITICAL') {
      return /\b(emergency|pain|trauma|hospital|urgent|911|988|suicide|self-harm|medical|injury|bleeding)\b/.test(contentOnlyText);
    }
    if (tag === 'PII_PROTECTION') {
      return /\b(credit card|debit card|payment|card ending|ssn|social security|bank account|pii|sensitive|carecredit)\b/.test(contentOnlyText);
    }
    if (tag === 'COMPETITOR_MENTION') {
      return /\b(competitor|comparison|vs|versus|other provider|better than|alternative to)\b/.test(contentOnlyText);
    }
    if (tag === 'LEGAL_COMPLIANCE') {
      return spec?.meta?.isRegulated === true || /\b(legal advice|disclaimer|statute|law|mandated disclosure|terms of service|warranty|liability)\b/.test(contentOnlyText);
    }
    if (tag === 'HUMAN_ESCALATION') {
      return /\b(transfer|escalat|receptionist|front desk|manager|on-call|live agent)\b/.test(contentOnlyText);
    }
    if (tag === 'CONSENT_DISCLOSURE') {
      return /\b(record|recording|consent to record|ai disclosure)\b/.test(contentOnlyText);
    }
    if (tag === 'IDENTITY_VERIFICATION') {
      return /\b(verify identity|verification|account lookup|existing patient verification|date of birth verification|security question)\b/.test(contentOnlyText);
    }

    return false;
  });
}

export async function compilePromptPackage(input: CompileInput): Promise<PromptPackageDraft> {
  let spec: BusinessSpecification;

  if (input.businessSpec && input.businessSpec.meta) {
    // Deep-clone so we never mutate the caller's input object in place.
    spec = structuredClone(input.businessSpec);
  } else {
    const biz = (input.business || {}) as any;
    const mission = (input.mission || {}) as CallMission;
    const tone = input.personality?.tone ? [input.personality.tone] : ["Professional", "Helpful"];
    spec = {
      meta: {
        companyName: biz.companyName || biz.businessName || "Enterprise Client",
        agentName: biz.agentName || "Voice Assistant",
        industry: biz.industry || "General",
        isRegulated: false,
        toneProfile: tone,
        primaryGoal: mission.primaryGoal || biz.description || "Assist callers",
        languageMode: input.languageMode || input.business?.languageMode || "english"
      },
      businessSnapshot: {
        operatingHours: biz.operatingHours || "Standard Business Hours",
        servicesOffered: biz.servicesOffered || [],
        policies: {
          cancellation: biz.policies?.cancellation || "None — not specified",
          refunds: biz.policies?.refunds || "None — not specified",
          escalationNumbers: biz.policies?.escalationNumbers || []
        }
      },
      callFlowPlan: { steps: [] },
      knowledgeBase: { faqs: [], objections: [] },
      tools: []
    };
  }

  spec.callFlowPlan = spec.callFlowPlan || { steps: [] };
  spec.callFlowPlan.steps = spec.callFlowPlan.steps || [];
  spec.knowledgeBase = spec.knowledgeBase || { faqs: [], objections: [] };
  spec.knowledgeBase.faqs = spec.knowledgeBase.faqs || [];
  spec.knowledgeBase.objections = spec.knowledgeBase.objections || [];
  spec.tools = spec.tools || [];

  // Hydrate via specialist planners if missing steps/KB (or if Hindi/Hinglish mode and
  // missing Devanagari). Mode is the source of truth \u2014 not a mention of Hindi support.
  const isHindiMode = spec.meta?.languageMode === 'hindi' || spec.meta?.languageMode === 'hinglish';
  const needWorkflow = !spec.callFlowPlan.fsmStates || spec.callFlowPlan.fsmStates.length === 0;
  const needKnowledge = spec.knowledgeBase.faqs.length === 0 ||
    (isHindiMode && !spec.knowledgeBase.faqs.some((f: any) => /[\u0900-\u097F]/.test(f.question + f.answer)));

  // WorkflowArchitect and KnowledgeArchitect are independent, so run them concurrently.
  const [plannedFsmStates, plannedKb] = await Promise.all([
    needWorkflow ? WorkflowArchitect.planWorkflow(spec) : Promise.resolve(spec.callFlowPlan.fsmStates),
    needKnowledge ? KnowledgeArchitect.planKnowledge(spec) : Promise.resolve(spec.knowledgeBase)
  ]);
  spec.callFlowPlan.fsmStates = plannedFsmStates;
  spec.knowledgeBase = plannedKb;

  // ToolPlanner consumes the finalized call-flow states, so it must run afterwards.
  spec.tools = await ToolPlanner.planTools(spec);

  const llm = getLlmClient();
  let draft: PromptPackageDraft = input.extractedIR
    ? ({ ...input.extractedIR } as unknown as PromptPackageDraft)
    : await llm.generateReviewDraft(input as BlueprintJson);
  logger.debug("compilePromptPackage: CoT draft returned", {
    faqsCount: draft?.faqCards?.length,
    objectionsCount: draft?.objectionCards?.length,
  });
  draft = mergeUserOverrides(draft, input.overrides);
  draft.businessSpec = spec;

  // Register the planned tools on the draft, preserving each tool's JSON Schema.
  // This is the ONLY path by which tools reach the project record and the platform
  // export — without it the prompt text would be the only place tools are defined.
  draft.suggestedFunctions = (Array.isArray(spec.tools) ? spec.tools : []).map((t: any) => ({
    name: t?.name,
    category: 'Tool',
    description: t?.description || '',
    purposeInPrompt: t?.associatedStateId ? `Invoked at state: ${t.associatedStateId}` : '',
    requiredInputs: Array.isArray(t?.parameters?.required) ? t.parameters.required : [],
    expectedOutputs: [],
    enabled: true,
    parameters: t?.parameters || { type: 'object', properties: {} },
  })).filter((f: any) => !!f.name);

  // Synchronize dynamicVariables hierarchy
  draft.dynamicVariables = resolveVariables(
    spec.dynamicVariables,
    input.dynamicVariables,
    input.overrides?.dynamicVariables
  );

  const steps = (Array.isArray(spec.callFlowPlan?.fsmStates) && spec.callFlowPlan.fsmStates.length > 0)
    ? spec.callFlowPlan.fsmStates
    : (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : []);
  const allSlots = Array.from(new Set<string>(steps.flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : []))).filter(Boolean);
  const allSlotsSet = new Set(allSlots);
  const declaredVarKeys = new Set(draft.dynamicVariables.map((v: any) => v?.key).filter(Boolean));
  
  for (const slot of allSlots) {
    if (!declaredVarKeys.has(slot)) {
      draft.dynamicVariables.push({
        key: slot,
        label: slot,
        type: 'caller',
        fieldDirection: 'outfield',
        required: true,
        defaultValue: '',
        source: 'extraction',
        description: `Collected slot: ${slot}`
      });
      declaredVarKeys.add(slot);
    }
  }

  // Set missing fieldDirections based on strict usage logic
  draft.dynamicVariables.forEach((v: any) => {
    if (allSlotsSet.has(v.key) || v.source === 'extraction') {
      v.fieldDirection = 'outfield';
    } else if (!v.fieldDirection) {
      v.fieldDirection = 'infield'; 
    }
  });

  const needsDatetime = /date|time|appointment|schedule|booking/i.test(spec?.meta?.primaryGoal || "") || /date|time|appointment/i.test(JSON.stringify(draft?.callFlowSteps || []));
  if (needsDatetime) {
    const sysVars = [
      { key: 'current_day', label: 'Current Day', type: 'runtime' as const, description: 'The current day of the week', fieldDirection: 'infield' as const, required: true, source: 'system', defaultValue: '' },
      { key: 'current_date', label: 'Current Date', type: 'runtime' as const, description: 'The current date', fieldDirection: 'infield' as const, required: true, source: 'system', defaultValue: '' },
      { key: 'current_time', label: 'Current Time', type: 'runtime' as const, description: 'The current time in the local timezone', fieldDirection: 'infield' as const, required: true, source: 'system', defaultValue: '' }
    ];
    for (const sv of sysVars) {
      if (!draft.dynamicVariables.find((v: any) => v.key === sv.key)) {
        draft.dynamicVariables.push(sv);
      }
    }
  }

  try {
    // Default rules rarely change; cache them so we don't hit the DB on every compile.
    const dbRules = await cached('default_prompt_rules', 5 * 60_000, () =>
      prisma.promptRule.findMany({ where: { isDefault: true } }));
    draft.appliedRules = filterRelevantRules(dbRules, spec, draft);
  } catch (err) {
    logger.warn("compilePromptPackage: could not fetch default PromptRules", err);
    draft.appliedRules = draft.appliedRules || [];
  }

  const rawGuardrails = (draft.appliedRules || [])
    .filter((r: any) => r?.category === 'GUARDRAILS' && r?.content)
    .map((r: any) => r.content)
    .join('\n\n');

  draft.optimizedGuardrails = await GuardrailOptimizer.optimizeGuardrails(rawGuardrails, spec.meta, resolveRegion(spec, draft));

  let finalPrompt = assembleUnifiedPrompt(spec, draft);
  const policy = resolveLanguagePolicy(spec, draft);
  let langQuality = validateLanguageQuality(finalPrompt, policy);

  // Judge & Repair loop
  if (JUDGE_ENABLED) {
    let transcript: ChatMessage[] = Array.isArray(input.transcript) ? input.transcript : [];
    if (transcript.length === 0 && input.sessionId) {
      try {
        const session = await prisma.builderSession.findUnique({ where: { id: input.sessionId } });
        if (session?.messagesJson && session.messagesJson !== '[]') {
          const parsed = JSON.parse(session.messagesJson);
          if (Array.isArray(parsed)) {
            transcript = parsed;
          }
        }
      } catch (err) {
        logger.warn("compilePromptPackage: failed to load transcript from builderSession", err);
      }
    }

    let best = {
      prompt: finalPrompt,
      report: await judgePrompt({ transcript, finalPrompt, spec, policy })
    };
    const initialIssues = [...best.report.issues];
    let round = 0;
    const start = Date.now();

    // Repair only on CRITICAL. `major` issues are advisory — they do not block
    // delivery, so spending an LLM round (and the user's latency) on them is waste;
    // they are surfaced as warnings instead.
    const needsRepair = (r: typeof best.report) => r.blockingCount > 0;

    while (
      needsRepair(best.report) &&
      round < JUDGE_MAX_ROUNDS &&
      Date.now() - start < JUDGE_TIME_BUDGET_MS
    ) {
      logger.info(`compilePromptPackage: Judge loop round ${round + 1}/${JUDGE_MAX_ROUNDS}, blockingCount=${best.report.blockingCount}, score=${best.report.score}`);
      try {
        // A flow-shaped problem (a required stage with no state) cannot be fixed by
        // editing prompt text — the state machine has to be rebuilt. Re-plan with the
        // judge's findings as constraints, then re-assemble; fall back to the text
        // editor for wording-level issues.
        const structural = best.report.issues.filter(
          i => i.severity === 'critical' && i.category === 'coverage'
        );
        let repaired: string;
        if (structural.length > 0) {
          repaired = await repairStructurally(spec, draft, structural);
        } else {
          repaired = await repairFromJudge({
            finalPrompt: best.prompt,
            report: best.report,
            policy,
            agentGender: policy.agentGender
          });
        }
        if (!structurePreserved(repaired, best.prompt)) {
          logger.warn(`compilePromptPackage: repair discarded due to structure mismatch in round ${round}`);
          break;
        }
        const newReport = await judgePrompt({ transcript, finalPrompt: repaired, spec, policy });
        if (newReport.score > best.report.score) {
          best = { prompt: repaired, report: newReport };
        } else {
          logger.info(`compilePromptPackage: Anti-thrash triggered. New score (${newReport.score}) <= best score (${best.report.score}). Stopping loop.`);
          break;
        }
      } catch (err) {
        logger.warn(`compilePromptPackage: error in judge/repair round ${round}`, err);
        break;
      }
      round++;
    }

    const remainingKeys = new Set(best.report.issues.map(i => `${i.category}:${i.description}`));
    best.report.fixedIssues = initialIssues.filter(i => !remainingKeys.has(`${i.category}:${i.description}`));

    finalPrompt = best.prompt;
    draft.judgeReport = best.report;
    langQuality = validateLanguageQuality(finalPrompt, policy);
  }

  draft.finalPrompt = finalPrompt;
  draft.languageQualityScore = langQuality.score;

  const varValidation = validateVariableConsistency(finalPrompt, draft?.dynamicVariables || []);
  const fallbackValidation = validateFallbackDialogue(finalPrompt);
  const coherenceValidation = validateCoherence(finalPrompt, draft, spec);
  const flowValidation = validateFlowCompleteness(spec, steps);

  const validationErrors: string[] = [
    ...varValidation.errors,
    ...fallbackValidation.errors,
    ...coherenceValidation.errors,
    ...flowValidation.errors
  ];

  // Check placeholder integrity
  const matches = Array.from(finalPrompt.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g));
  const declaredKeys = new Set((draft?.dynamicVariables || []).map((v: { key: string }) => v.key));
  for (const match of matches) {
    const varName = match[1];
    if (!declaredKeys.has(varName)) {
      validationErrors.push(`Undeclared dynamic placeholder {{${varName}}} found in prompt text.`);
    }
  }

  // Check for suspicious length
  const totalItems = (draft?.faqCards?.length || 0) + (spec.callFlowPlan?.steps?.length || 0);
  if (totalItems >= 5 && finalPrompt.length < 800) {
    validationErrors.push(`Suspiciously short prompt generated (${finalPrompt.length} chars) relative to ${totalItems} operational items.`);
  }

  // Non-blocking token-budget check: flags a token-heavy prompt without failing it.
  const budget = validatePromptBudget(finalPrompt);
  draft.estimatedTokens = budget.score;

  if (draft.judgeReport && draft.judgeReport.issues.length > 0) {
    const blockingOrMajor = draft.judgeReport.issues.filter(i => i.severity === 'critical' || i.severity === 'major');
    for (const issue of blockingOrMajor) {
      validationErrors.push(`[Judge - ${issue.severity.toUpperCase()}] ${issue.description} (${issue.suggestedFix})`);
    }
    const minors = draft.judgeReport.issues.filter(i => i.severity === 'minor');
    for (const issue of minors) {
      (draft.validationWarnings = draft.validationWarnings || []).push(`[Judge - minor] ${issue.description}`);
    }
  }

  draft.validationErrors = validationErrors;
  draft.validationWarnings = [...(draft.validationWarnings || []), ...(budget.warnings || []), ...(langQuality.warnings || [])];

  const hasCriticalJudgeIssues = (draft.judgeReport?.blockingCount ?? 0) > 0;
  draft.requiresHumanReview = validationErrors.length > 0 || hasCriticalJudgeIssues;

  if (hasCriticalJudgeIssues && JUDGE_HARD_GATE) {
    draft.validationStatus = 'failed_review_required';
  } else if (validationErrors.length > 0 || hasCriticalJudgeIssues) {
    draft.validationStatus = 'warning';
  } else {
    draft.validationStatus = 'success';
  }

  return draft;
}
