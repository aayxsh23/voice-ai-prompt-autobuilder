import { geminiClient as baseGeminiClient } from "@/lib/llm/geminiProvider";

export const geminiClient = {
  async generate({ systemInstruction, prompt }: { systemInstruction: string; prompt: string }): Promise<{ text: string }> {
    return baseGeminiClient.generate({ systemInstruction, prompt });
  }
};

const FROZEN_SECTION_PATTERNS = [
  /^### CALL FLOW\n[\s\S]*?(?=\n^### )/m,
  /^### FAQ[\s\S]*?(?=\n^### )/m,
  /^### OBJECTION[\s\S]*?(?=\n^### )/m,
  /^### MANDATORY EMERGENCY[\s\S]*?(?=\n^### )/m,
  /^### CLOSING RULES[\s\S]*?(?=\n^### )/m,
  /^### ENDING RULE[\s\S]*?$/m,
];

function freezeSections(prompt: string): { sanitized: string; frozen: Map<string, string> } {
  const frozen = new Map<string, string>();
  let sanitized = prompt;
  let index = 0;
  for (const pattern of FROZEN_SECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      const key = `__FROZEN_BLOCK_${index++}__`;
      frozen.set(key, match);
      return key;
    });
  }
  return { sanitized, frozen };
}

function restoreSections(optimized: string, frozen: Map<string, string>): string {
  let result = optimized;
  for (const [key, value] of frozen) {
    result = result.replace(key, value);
  }
  return result;
}

export class PromptOptimizer {
  async optimize(rawPrompt: string): Promise<string> {
    if (!rawPrompt || rawPrompt.trim() === "") return rawPrompt;
    const { sanitized, frozen } = freezeSections(rawPrompt);
    const response = await geminiClient.generate({
      systemInstruction: `You are a Prompt Optimization Engine for voice AI runtime execution. Strip conversational fluff, redundant prose, and passive explanations. Condense syntax into direct, actionable spoken rules and strict state transitions while preserving all core directives, session context variables, and safety guardrails. Do NOT change any section headers or placeholders.`,
      prompt: `Optimize the following system prompt for minimal token overhead and maximum instruction adherence:\n${sanitized}`
    });
    return restoreSections(response.text || sanitized, frozen);
  }
}
