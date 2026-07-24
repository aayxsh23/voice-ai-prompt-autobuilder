import { JudgeOutput, AssemblerOutput, BusinessSpecification } from "../types";
import { safeParseJson } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { logger } from "@/lib/logger";

export class TheJudge {
  public static async evaluate(spec: BusinessSpecification, assemblerOutput: AssemblerOutput): Promise<JudgeOutput> {
    const prompt = `You are The Judge for a Voice AI prompt compilation pipeline.
Your task is to evaluate the final generated markdown prompt against the original business specification and rules.

BUSINESS SPECIFICATION:
${JSON.stringify(spec, null, 2)}

FINAL PROMPT TO EVALUATE:
${assemblerOutput.finalPrompt}

You must evaluate the prompt for the following specific issues:
1. "duplicate_rule": A rule text or intent appears in more than one rendered section. (e.g. A cross-sell objection is mentioned in both the ### RULES section and a state's notes). Culprit: "optimizer" or "assembler".
2. "orphaned_protocol": A capturedTopic from the specification doesn't appear anywhere in the final markdown. Culprit: "optimizer" (it dropped it) or "assembler" (it didn't render it).
3. "token_bloat": The consolidated ### RULES section exceeds roughly 300 words. Culprit: "assembler".
4. "structural": The prompt is malformed, missing mandatory sections, or has broken markdown. Culprit: "assembler".
5. "coverage": Missing required FSM states or tools. Culprit: "architect".
6. "security": Guardrails are missing or circumventable. Culprit: "optimizer".

Return a strictly-typed JSON object matching this schema:
{
  "passed": boolean,
  "score": number, // 0-100
  "issues": [
    {
      "type": "structural" | "wording" | "coverage" | "security" | "duplicate_rule" | "orphaned_protocol" | "token_bloat",
      "culprit": "architect" | "optimizer" | "assembler",
      "detail": "Detailed explanation of the issue",
      "suggestedFix": "How to fix it"
    }
  ]
}`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are The Judge. Return ONLY a valid JSON object matching the requested schema.",
        prompt,
        responseMimeType: "application/json",
        temperature: 0
      });

      const parsed: JudgeOutput = safeParseJson(response.text, {
        passed: false,
        score: 0,
        issues: [{ type: "structural", culprit: "assembler", detail: "JSON Parse failed in Judge." }]
      });

      return parsed;
    } catch (err) {
      logger.error("TheJudge failed", err);
      return {
        passed: false,
        score: 0,
        issues: [{ type: "structural", culprit: "assembler", detail: "Judge LLM call failed." }]
      };
    }
  }
}
