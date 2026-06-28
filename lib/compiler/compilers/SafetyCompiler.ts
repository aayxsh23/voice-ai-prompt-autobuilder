// lib/compiler/compilers/SafetyCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class SafetyCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    return await geminiClient.generate({
      systemInstruction: `You are an Enterprise Voice Safety and Objection Compiler.
Compile strict boundary rules, objection handling scripts, and low-confidence speech absorbers.
You MUST include explicit correction routing logic stating: "If the user corrects a piece of data during summary or collection, update that specific slot, reset the parsing buffer, and immediately resume from where you left off."`,
      prompt: `Generate the SAFETY PROTOCOLS, OBJECTION HANDLING, and ASR CORRECTION SHOCK ABSORBERS for agent: ${ir.meta?.agentName || "Voice Agent"} (${ir.meta?.companyName || "Enterprise"}). Ensure emergency triggers direct immediately to human operators or emergency services.`
    }).then(res => res.text);
  }
}
