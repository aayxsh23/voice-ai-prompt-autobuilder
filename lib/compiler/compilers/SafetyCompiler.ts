// lib/compiler/compilers/SafetyCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class SafetyCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    const response = await geminiClient.generate({
      systemInstruction: `You are a Voice AI Safety Engineer. Compile the edge-case protocol.
REQUIREMENT 1 (ASR Dropouts): If the user says 'Hello?' out of context, the agent must pause, say 'Can you hear me clearly?', wait for confirmation, and re-anchor the script.
REQUIREMENT 2 (Correction Routing): If a user corrects data, silently update the slot, acknowledge, and resume immediately. Do not restart the flow.
Ensure acute emergency triggers direct immediately to standard emergency operators or live representative transfer.`,
      prompt: `Generate the SAFETY PROTOCOLS, ASR DROPOUTS, and CORRECTION ROUTING rules for agent: ${ir.meta?.agentName || "Voice Agent"} (${ir.meta?.companyName || "Enterprise"}).`
    });
    return response.text;
  }
}
