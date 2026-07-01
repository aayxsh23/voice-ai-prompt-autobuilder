import { PromptAssembler, assembleUnifiedPrompt } from "../compiler/assembler/PromptAssembler";
import { getLlmClient } from "../llm/llmClient";
import { BlueprintJson, PromptPackageDraft, SchemaOverrides, BusinessSpecification } from "../llm/types";
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
  const userQuestions = new Set((overrides.faqPairs ?? []).map(f => f.question.toLowerCase().trim()));
  const dedupedFaqs = (draft.faqCards ?? []).filter(f => !userQuestions.has(f.question.toLowerCase().trim()));
  const userTriggers = new Set((overrides.objectionPairs ?? []).map(o => (o.trigger || o.objection || '').toLowerCase().trim()));
  const dedupedObjs = (draft.objectionCards ?? []).filter(o => !userTriggers.has((o.trigger || o.objection || '').toLowerCase().trim()));
  return {
    ...draft,
    faqCards: [...(overrides.faqPairs ?? []), ...dedupedFaqs],
    objectionCards: [...(overrides.objectionPairs ?? []), ...dedupedObjs],
    verbatimLines: [...(overrides.verbatimLines ?? []), ...(draft.verbatimLines ?? [])],
    transferConditions: [...(overrides.transferRules ?? []), ...(draft.transferConditions ?? [])]
  };
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
  const steps = (spec.callFlowPlan?.steps && spec.callFlowPlan.steps.length > 0)
    ? spec.callFlowPlan.steps
    : (draft?.callFlowSteps || []);
  const allSlots = Array.from(new Set<string>(steps.flatMap((s: any) => s.slotsToCollect || [])));
  draft.dynamicVariables = draft?.dynamicVariables || [];
  const declaredVarKeys = new Set(draft.dynamicVariables.map((v: any) => v.key));
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
