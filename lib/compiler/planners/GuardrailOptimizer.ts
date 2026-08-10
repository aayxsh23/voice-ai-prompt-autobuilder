import { BusinessSpecification } from "@/lib/llm/types";
import { getLlmClient } from "@/lib/llm/llmClient";
import { logger } from "@/lib/logger";

export class GuardrailOptimizer {
  /**
   * Takes the raw contextual guardrail text and the project's spec.meta,
   * returns a pruned/rewritten version that only contains relevant rules.
   *
   * NEVER touches the canonical safety blocks (self-harm, hallucination, etc.).
   * Only rewrites/prunes contextual elements like emergency numbers, currency,
   * language-specific rules, PII handling specifics, domain-specific compliance.
   */
  public static async optimizeGuardrails(
    contextualGuardrails: string,
    meta: BusinessSpecification['meta'],
    region?: string
  ): Promise<string> {
    if (!contextualGuardrails || contextualGuardrails.trim() === '') {
      return '';
    }

const systemPrompt = `You are a precision Guardrail Optimizer for an AI voice agent.
Your task is to take a raw list of contextual guardrails and prune or rewrite them to perfectly match the deployment context.

DEPLOYMENT CONTEXT:
Region Code: ${region || 'Unknown'}
Language Mode: ${meta.languageMode || 'english'}
Industry: ${meta.industry || 'Unknown'}
Is Regulated: ${meta.isRegulated ? 'Yes' : 'No'}
Domain/Goal: ${meta.primaryGoal || 'Unknown'}
Scope Exclusions / Forbidden Actions: ${JSON.stringify(meta.scopeExclusions || [])}

RULES FOR OPTIMIZATION:
1. PRUNE irrelevant rules: Remove rules that do not apply to this deployment context. Aggressively drop rules that don't make sense for the current Domain/Goal or Industry. For example, if the agent is voice-only, remove rules about DTMF.
2. MODIFY rules to match context: If a rule mentions generic "currency", rewrite it to use the specific currency for the Region Code (e.g., "Indian Rupees (₹/INR)" for IN, "US Dollars ($/USD)" for US, "Qatari Riyals (QR/QAR)" for QA). If it mentions generic emergency numbers, rewrite to use the correct local emergency number (e.g. 112 for IN, 999 for QA, 911 for US).
3. DE-DUPLICATE rules: Identify and collapse rules that express the exact same constraint (e.g., "Never reschedule a refused lead" and "Do not re-engage explicitly refused leads") into a single rule to save tokens. CRITICAL: You must NOT lose any specific business data, policies, or operational constraints during this deduplication.
4. KEEP and REWRITE relevant rules: Any rule that applies to the Industry should be kept and rewritten to match the context of the user's business.
5. ANTI-CONTRADICTION RULE: If the user's business context, forbidden actions, or scope exclusions explicitly state that an action or data collection is forbidden, you MUST completely drop any guardrails or examples that contradict those constraints. Do not include examples (like 'OTP', 'SSN', 'credit card') in generic guardrails if the business explicitly forbids collecting them.
6. DO NOT ADD new rules that weren't in the input list.
7. DO NOT TOUCH canonical safety concepts like self-harm, suicide, hallucination, or user abuse. These are handled elsewhere.

Output ONLY the optimized guardrail text. Format as a markdown bulleted list.`;

    const userPrompt = `RAW CONTEXTUAL GUARDRAILS:\n\n${contextualGuardrails}\n\nPlease output the optimized guardrails.`;

    try {
      const client = getLlmClient();
      const optimized = await client.generateRaw!(userPrompt, 0, {
        systemInstruction: systemPrompt,
        contextLabel: 'guardrail-optimizer',
        sessionId: meta.sessionId,
      });

      return optimized.trim();
    } catch (error) {
      logger.error("GuardrailOptimizer failed, falling back to raw guardrails", { error });
      // Fail safe: return the raw guardrails if the LLM fails
      return contextualGuardrails.trim();
    }
  }
}
