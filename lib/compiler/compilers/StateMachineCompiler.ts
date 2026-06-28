// lib/compiler/compilers/StateMachineCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class StateMachineCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    const contextSummary = ir.context && ir.context.length > 0
      ? `Pre-loaded Session Context Variables available without asking: ${JSON.stringify(ir.context, null, 2)}`
      : "No pre-loaded session variables.";

    const response = await geminiClient.generate({
      systemInstruction: `You are an elite Voice Interaction Architect. 
Your single job is to output a structural CALL FLOW script based on the provided data.
You MUST write explicit dialogue instructions for the agent using the pattern: Say: "exact text".
Enforce a turn-taking constraint: One idea per sentence, never stack questions. Wait for response.
Never ask the caller for details already provided in the Pre-loaded Session Context Variables.`,
      prompt: `Compile the strict script blocks for these sequential operational states:
${JSON.stringify(ir.states, null, 2)}

${contextSummary}
Ensure each state explicitly blocks transition until its required fields are populated.`
    });
    return response.text;
  }
}
