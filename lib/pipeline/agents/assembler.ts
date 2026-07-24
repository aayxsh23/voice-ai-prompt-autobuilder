import { AssemblerInput, AssemblerOutput } from "../types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { logger } from "@/lib/logger";

export class MasterAssembler {
  public static async assemble(input: AssemblerInput): Promise<AssemblerOutput> {
    const prompt = `You are the Master Assembler. Your task is to combine the provided business specification, the state machine plan, global guardrails, and tools into a single, cohesive markdown text prompt for a Voice AI agent.

BUSINESS SPECIFICATION:
${JSON.stringify(input.businessSpec, null, 2)}

FSM STATES (WITH MAPPED NOTES/RULES):
${JSON.stringify(input.fsmStates, null, 2)}

GLOBAL GUARDRAILS:
${JSON.stringify(input.globalGuardrails, null, 2)}

TOOLS:
${JSON.stringify(input.tools, null, 2)}

RULES FOR ASSEMBLY:
1. Create EXACTLY ONE "### RULES" section. Fold all GLOBAL GUARDRAILS into this single section.
2. DO NOT restate or duplicate any rule that is already mapped into a specific state's "notes" or "closeVariants". The "### RULES" section must only contain globally applicable rules, staying as concise as possible (target ~220 words).
3. Ensure the voice agent persona, tone, and operating hours are explicitly stated.
4. Render tool usages correctly using declarative arguments.

Output ONLY the final markdown text prompt.`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are the Master Assembler. Generate the final monolithic text prompt.",
        prompt,
        temperature: 0
      });

      return {
        finalPrompt: response.text
      };
    } catch (err) {
      logger.error("MasterAssembler failed", err);
      throw new Error("MasterAssembler failed to generate prompt.");
    }
  }
}
