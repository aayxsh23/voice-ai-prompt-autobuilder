// lib/compiler/assembler/PromptOptimizer.ts

import { geminiClient } from "@/lib/llm/geminiProvider";

export class PromptOptimizer {
  async optimize(rawPrompt: string): Promise<string> {
    if (!rawPrompt || rawPrompt.trim() === "") return rawPrompt;

    const response = await geminiClient.generate({
      systemInstruction: `You are a Prompt Optimization Engine for voice AI runtime execution.
Strip conversational fluff, redundant prose, and passive explanations.
Condense syntax into direct, actionable spoken rules and strict state transitions while preserving all core directives, session context variables, and safety guardrails.`,
      prompt: `Optimize the following system prompt for minimal token overhead and maximum instruction adherence:
${rawPrompt}`
    });

    return response.text || rawPrompt;
  }
}
