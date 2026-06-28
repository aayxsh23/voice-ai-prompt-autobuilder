// lib/pipeline/promptCompiler.ts

import { StateMachineCompiler } from "../compiler/compilers/StateMachineCompiler";
import { VoiceCompiler } from "../compiler/compilers/VoiceCompiler";
import { ToolCompiler } from "../compiler/compilers/ToolCompiler";
import { SafetyCompiler } from "../compiler/compilers/SafetyCompiler";
import { StateValidator } from "../compiler/validators/StateValidator";
import { ToolValidator } from "../compiler/validators/ToolValidator";
import { PromptAssembler } from "../compiler/assembler/PromptAssembler";
import { PromptOptimizer } from "../compiler/assembler/PromptOptimizer";
import { VoiceAgentIR } from "../compiler/ir/IntermediateRepresentation";
import { getLlmClient } from "../llm/llmClient";
import { BlueprintJson, PromptPackageDraft } from "../llm/types";

export async function executePromptCompilationPipeline(extractedIR: VoiceAgentIR): Promise<string> {
  // 1. Structural Logic Gate Validation
  const stateValidator = new StateValidator();
  const toolValidator = new ToolValidator();

  const stateCheck = stateValidator.validate(extractedIR);
  if (!stateCheck.isValid) {
    throw new Error(`Pipeline Compilation Halting (State Validation): \n${stateCheck.errors.join("\n")}`);
  }

  const toolCheck = toolValidator.validate(extractedIR);
  if (!toolCheck.isValid) {
    throw new Error(`Pipeline Compilation Halting (Tool Validation): \n${toolCheck.errors.join("\n")}`);
  }

  // 2. Parallel Module Extraction Generation
  const stateMachineCompiler = new StateMachineCompiler();
  const voiceCompiler = new VoiceCompiler();
  const toolCompiler = new ToolCompiler();
  const safetyCompiler = new SafetyCompiler();

  const [flowBlock, voiceBlock, toolsBlock, safetyBlock] = await Promise.all([
    stateMachineCompiler.compile(extractedIR),
    voiceCompiler.compile(extractedIR),
    toolCompiler.compile(extractedIR),
    safetyCompiler.compile(extractedIR)
  ]);

  // 3. Assemble Blocks into Unified Output Structure
  const assembler = new PromptAssembler();
  const rawPromptString = assembler.assemble(extractedIR, {
    flow: flowBlock,
    voice: voiceBlock,
    tools: toolsBlock,
    safety: safetyBlock
  });

  // 4. Optimize Syntax
  const optimizer = new PromptOptimizer();
  const completedPromptString = await optimizer.optimize(rawPromptString);

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

export async function compilePromptPackage(input: BlueprintJson): Promise<PromptPackageDraft> {
  const llm = getLlmClient();
  const baseDraft = await llm.generateReviewDraft(input);

  try {
    const ir = mapBlueprintToIR(input);
    const compiledSystemPrompt = await executePromptCompilationPipeline(ir);
    baseDraft.systemPrompt = compiledSystemPrompt;
  } catch (err) {
    console.warn("Enterprise compilation warning, maintaining base draft:", err);
  }

  return baseDraft;
}
