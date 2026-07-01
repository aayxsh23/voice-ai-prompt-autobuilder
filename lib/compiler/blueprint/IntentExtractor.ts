// lib/compiler/blueprint/IntentExtractor.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class IntentExtractor {
  async extract(textOrHistory: string | any[]): Promise<{
    sequenceOrder: number;
    stateId: string;
    stateName: string;
    explicitDialogueScript: string;
    slotsToCollect: string[];
    fallbackBehavior: string;
  }[]> {
    const serialized = typeof textOrHistory === "string" ? textOrHistory : JSON.stringify(textOrHistory);
    const fallback = [
      {
        sequenceOrder: 1,
        stateId: "greeting",
        stateName: "Greeting & Verification",
        explicitDialogueScript: 'Say: "Hello {{Customer_Name}}, calling from our operations desk. How can I assist you today?"',
        slotsToCollect: [],
        fallbackBehavior: "Re-state company identity and ask how to help.",
        isFallback: true
      },
      {
        sequenceOrder: 2,
        stateId: "collect_req",
        stateName: "Requirement Collection",
        explicitDialogueScript: 'Say: "Could you please provide your 10-digit callback phone number or reference ID?"',
        slotsToCollect: ["phone_number"],
        fallbackBehavior: "Offer to connect with a human dispatcher if caller cannot locate ID.",
        isFallback: true
      }
    ];

    const response = await geminiClient.generate({
      systemInstruction: `You are an operational Intent Extractor mapping user workflows to sequential call states.
Extract the primary operational call goals and convert them into strict state machine sequence blocks.
Enforce explicit dialogue script instructions using Say: "exact text".`,
      prompt: `Extract operational states from this input:
${serialized}

Return a JSON array of state objects with sequenceOrder, stateId, stateName, explicitDialogueScript, slotsToCollect, and fallbackBehavior.`
    });

    const parsed = safeParseJson(response.text, fallback);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  }
}
