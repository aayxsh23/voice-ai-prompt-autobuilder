// lib/compiler/compilers/StateMachineCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class StateMachineCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    const contextSummary = ir.context && ir.context.length > 0
      ? `Pre-loaded Session Context Variables available without asking: ${JSON.stringify(ir.context, null, 2)}`
      : "No pre-loaded session variables.";

    const response = await geminiClient.generate({
      systemInstruction: `You are an elite Voice Interface Compiler. Transform IR states into explicit, turn-by-turn dialogue scripts.
RULE 1: Every state MUST have an exact spoken phrase formatted as Say: "exact text".
RULE 2: Enforce the turn-taking IRON RULE: Maximum 1-2 short sentences per turn, ending with ONE question.
RULE 3: Never stack questions. Acknowledge the user's previous answer before moving forward.
Never ask the caller for details already provided in the Pre-loaded Session Context Variables.`,
      prompt: `Compile the strict script blocks for these sequential operational states:
${JSON.stringify(ir.states, null, 2)}

${contextSummary}
Ensure each state explicitly blocks transition until its required fields are populated.`
    });
    return response.text;
  }
}
