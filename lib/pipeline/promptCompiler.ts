import { StateValidator } from "../compiler/validators/StateValidator";
import { ToolValidator } from "../compiler/validators/ToolValidator";
import { PromptAssembler } from "../compiler/assembler/PromptAssembler";
import { PromptOptimizer } from "../compiler/assembler/PromptOptimizer";
import { VoiceAgentIR } from "../compiler/ir/IntermediateRepresentation";
import { getLlmClient } from "../llm/llmClient";
import { BlueprintJson, PromptPackageDraft, SchemaOverrides } from "../llm/types";
import { PromptCompilationError } from "@/lib/errors/PromptCompilationError";
import { validatePrompt } from "@/lib/pipeline/validators/QualitySecurityValidator";

export async function executePromptCompilationPipeline(extractedIR: VoiceAgentIR, draft?: Partial<PromptPackageDraft>): Promise<string> {
  const stateValidator = new StateValidator();
  const toolValidator = new ToolValidator();

  const stateCheck = stateValidator.validate(extractedIR);
  if (!stateCheck.isValid) {
    throw new PromptCompilationError(`Pipeline Compilation Halting (State Validation): \n${stateCheck.errors.join("\n")}`);
  }

  const toolCheck = toolValidator.validate(extractedIR);
  if (!toolCheck.isValid) {
    throw new PromptCompilationError(`Pipeline Compilation Halting (Tool Validation): \n${toolCheck.errors.join("\n")}`);
  }

  const assembler = new PromptAssembler();
  const rawPromptString = assembler.assemble(extractedIR, draft);

  // Bypassing optimizer to preserve token overhead, whitespace, and repetitive rules for voice AI adherence
  // const optimizer = new PromptOptimizer();
  // const completedPromptString = await optimizer.optimize(rawPromptString);
  const completedPromptString = rawPromptString;

  const validation = validatePrompt(completedPromptString);
  if (!validation.valid) {
    throw new PromptCompilationError(`Prompt quality/security validation failed:\n${validation.errors.join("\n")}`);
  }

  return completedPromptString;
}

function mapBlueprintToIR(input: BlueprintJson): VoiceAgentIR {
  const biz = input.business || {};
  const mission = input.mission || {};
  const tone = input.personality?.tone ? [input.personality.tone] : ["Professional", "Calm", "Direct"];
  const lang = input.personality?.languageVariant || "English";

  const name = biz.companyName || biz.businessName || "Enterprise Client";
  const desc = biz.valueProposition || biz.description || "General inquiry and customer assistance";

  return {
    meta: {
      agentName: name !== "Enterprise Client" ? `${name} Assistant` : "Voice Agent",
      companyName: name,
      role: mission.primaryGoal || "Automated Voice Coordinator",
      toneProfile: tone,
      contextScope: desc,
      languageVariant: lang
    },
    context: [
      { key: "Customer_Name", label: "Customer Name", description: "Verified caller name", source: "crm", defaultValue: "Valued Caller" }
    ],
    states: [
      {
        sequenceOrder: 1,
        stateId: "greeting",
        stateName: "Greeting & Verification",
        explicitDialogueScript: `Say: "Hello {{Customer_Name}}, welcome to ${name}. How can I help you today?"`,
        slotsToCollect: [],
        fallbackBehavior: "Clarify caller intent and offer assistance."
      },
      {
        sequenceOrder: 2,
        stateId: "fulfill_mission",
        stateName: "Mission Execution",
        explicitDialogueScript: `Say: "I can help with ${mission.primaryGoal || 'your request'}. Let me get those details for you."`,
        slotsToCollect: [],
        fallbackBehavior: "Escalate to human representative if needed."
      }
    ],
    slots: [],
    tools: []
  };
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

export async function compilePromptPackage(input: BlueprintJson): Promise<PromptPackageDraft> {
  const llm = getLlmClient();
  let draft = llm.generateWithCoT ? await llm.generateWithCoT(input) : await llm.generateReviewDraft(input);
  draft = mergeUserOverrides(draft, input.overrides);
  try {
    const ir = mapBlueprintToIR(input);
    const compiledSystemPrompt = await executePromptCompilationPipeline(ir, draft);
    const splitIdx = compiledSystemPrompt.indexOf("### TTS & VOICE RULES");
    if (splitIdx !== -1) {
      draft.agentPrompt = compiledSystemPrompt.substring(0, splitIdx).trim();
      draft.systemPrompt = compiledSystemPrompt.substring(splitIdx).trim();
    } else {
      draft.agentPrompt = compiledSystemPrompt;
      draft.systemPrompt = compiledSystemPrompt;
    }
    draft.systemPromptCompiled = true;
  } catch (err) {
    console.warn("Compilation pipeline error:", err);
    draft.systemPromptCompiled = false;
  }
  return draft;
}
