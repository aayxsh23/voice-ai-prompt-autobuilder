import { PromptAssembler, assembleUnifiedPrompt } from "../compiler/assembler/PromptAssembler";
import { getLlmClient } from "../llm/llmClient";
import { BlueprintJson, PromptPackageDraft, SchemaOverrides, BusinessSpecification } from "../llm/types";
import { prisma } from "@/lib/db";
import { PromptCompilationError } from "@/lib/errors/PromptCompilationError";
import { validateVariableConsistency } from "@/lib/pipeline/validators/VariableConsistencyValidator";
import { validateFallbackDialogue } from "@/lib/pipeline/validators/FallbackDialogueValidator";
import { validateCoherence } from "@/lib/pipeline/validators/CoherenceValidator";
import { WorkflowArchitect } from "../compiler/planners/WorkflowArchitect";
import { KnowledgeArchitect } from "../compiler/planners/KnowledgeArchitect";
import { ToolPlanner } from "../compiler/planners/ToolPlanner";

export async function executePromptCompilationPipeline(extractedIR: any, draft?: Partial<PromptPackageDraft>): Promise<string> {
  const assembler = new PromptAssembler();
  const completedPromptString = assembler.assemble(extractedIR, draft);

  const varValidation = validateVariableConsistency(completedPromptString, draft?.dynamicVariables || []);
  const fallbackValidation = validateFallbackDialogue(completedPromptString);
  const coherenceValidation = validateCoherence(completedPromptString, draft, extractedIR);

  const allErrors = [
    ...varValidation.errors,
    ...fallbackValidation.errors,
    ...coherenceValidation.errors
  ];

  if (allErrors.length > 0) {
    throw new PromptCompilationError(`Prompt validation failed:\n${allErrors.join("\n")}`);
  }

  return completedPromptString;
}

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

function filterRelevantRules(rules: any[], spec: BusinessSpecification, draft: any): any[] {
  const contextObj = {
    meta: spec?.meta,
    snapshot: spec?.businessSnapshot,
    flow: spec?.callFlowPlan,
    kb: spec?.knowledgeBase,
    tools: spec?.tools,
    draftFlow: draft?.callFlowSteps,
    draftFaqs: draft?.faqCards,
    draftObjs: draft?.objectionCards,
    useCase: draft?.useCase || spec?.meta?.primaryGoal
  };
  // Exclude structural keys like "faqCards" or "faq_topic" from raw text matching
  const contentOnlyText = JSON.stringify(contextObj).replace(/"(?:faqCards|faq_topic|faqs)":/g, '').toLowerCase();

  return rules.filter(r => {
    const tag = (r.tag || '').toUpperCase();
    
    // Core foundational rules for voice AI integrity
    if (['NUMBER', 'HALLUCINATION', 'OUT_OF_SCOPE'].includes(tag)) {
      return true;
    }

    // Telephony mechanics (only if active phone conversation features exist)
    if (tag === 'PHONE_NUMBER') {
      return /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(contentOnlyText) || /\b(phone number|telephone|call back|mobile|dial|extension)\b/.test(contentOnlyText);
    }
    if (['ABUSIVE_USER', 'INTERRUPTION', 'SILENCE'].includes(tag)) {
      return /\b(phone|call|caller|voice|agent|speak|transfer|hang up)\b/.test(contentOnlyText);
    }

    // Context-dependent Speakability rules
    if (tag === 'EMAIL') {
      return /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(contentOnlyText) || /\b(email|e-mail|gmail|outlook|yahoo|inbox)\b/.test(contentOnlyText);
    }
    if (tag === 'PINCODE') {
      return /\b(pin|pincode|passcode|otp|verification code|security code|zip code|postal code)\b/.test(contentOnlyText);
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

export async function compilePromptPackage(input: BlueprintJson | any): Promise<PromptPackageDraft | any> {
  let spec: BusinessSpecification;

  if (input.businessSpec && input.businessSpec.meta) {
    spec = input.businessSpec;
  } else {
    const biz = input.business || {};
    const mission = input.mission || {};
    const tone = input.personality?.tone ? [input.personality.tone] : ["Professional", "Helpful"];
    spec = {
      meta: {
        companyName: biz.companyName || biz.businessName || "Enterprise Client",
        agentName: biz.agentName || "Voice Assistant",
        industry: biz.industry || "General",
        isRegulated: false,
        toneProfile: tone,
        primaryGoal: mission.primaryGoal || biz.description || "Assist callers"
      },
      businessSnapshot: {
        operatingHours: "Standard Business Hours",
        servicesOffered: [],
        policies: {
          cancellation: "Standard cancellation policy applies.",
          refunds: "Standard refund policy applies.",
          escalationNumbers: []
        }
      },
      callFlowPlan: { steps: [] },
      knowledgeBase: { faqs: [], objections: [] },
      tools: []
    };
  }

  // Hydrate via specialist planners if missing steps/KB
  if (spec.callFlowPlan.steps.length === 0) {
    spec.callFlowPlan.steps = await WorkflowArchitect.planWorkflow(spec);
  }
  if (spec.knowledgeBase.faqs.length === 0) {
    spec.knowledgeBase = await KnowledgeArchitect.planKnowledge(spec);
  }
  if (spec.tools.length === 0) {
    spec.tools = await ToolPlanner.planTools(spec);
  }

  const llm = getLlmClient();
  let draft: any = input.extractedIR ? { ...input.extractedIR } : await llm.generateReviewDraft(input);
  console.log("[compilePromptPackage] CoT draft returned:", {
    primaryGoal: draft?.primaryGoal,
    faqsCount: draft?.faqCards?.length,
    objectionsCount: draft?.objectionCards?.length,
    guardrails: draft?.guardrails
  });
  draft = mergeUserOverrides(draft, input.overrides);
  draft.businessSpec = spec;

  // Synchronize dynamicVariables with any slots required by call flow steps
  const steps = (Array.isArray(spec.callFlowPlan?.steps) && spec.callFlowPlan.steps.length > 0)
    ? spec.callFlowPlan.steps
    : (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : []);
  const allSlots = Array.from(new Set<string>(steps.flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : []))).filter(Boolean);
  draft.dynamicVariables = Array.isArray(draft?.dynamicVariables) ? draft.dynamicVariables : [];
  const declaredVarKeys = new Set(draft.dynamicVariables.map((v: any) => v?.key).filter(Boolean));
  for (const slot of allSlots) {
    if (!declaredVarKeys.has(slot)) {
      draft.dynamicVariables.push({
        key: slot,
        label: slot,
        type: 'caller',
        required: true,
        defaultValue: '',
        source: 'extraction',
        description: `Collected slot: ${slot}`
      });
      declaredVarKeys.add(slot);
    }
  }

  try {
    const dbRules = await prisma.promptRule.findMany({ where: { isDefault: true } });
    draft.appliedRules = filterRelevantRules(dbRules, spec, draft);
  } catch (err) {
    console.warn("[compilePromptPackage] Could not fetch default PromptRules:", err);
    draft.appliedRules = draft.appliedRules || [];
  }

  const finalPrompt = assembleUnifiedPrompt(spec, draft);
  draft.finalPrompt = finalPrompt;

  const varValidation = validateVariableConsistency(finalPrompt, draft?.dynamicVariables || []);
  const fallbackValidation = validateFallbackDialogue(finalPrompt);
  const coherenceValidation = validateCoherence(finalPrompt, draft, spec);

  const validationErrors: string[] = [
    ...varValidation.errors,
    ...fallbackValidation.errors,
    ...coherenceValidation.errors
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

  draft.validationStatus = validationErrors.length > 0 ? 'warning' : 'success';
  draft.validationErrors = validationErrors;
  draft.requiresHumanReview = validationErrors.length > 0;

  return draft;
}
