// lib/compiler/blueprint/EntityExtractor.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class EntityExtractor {
  async extract(textOrHistory: string | any[]): Promise<{
    name: string;
    type: "string" | "number" | "date" | "email";
    ttsNormalizationRule: string;
    isRequired: boolean;
  }[]> {
    const serialized = typeof textOrHistory === "string" ? textOrHistory : JSON.stringify(textOrHistory);
    const fallback: {
      name: string;
      type: "string" | "number" | "date" | "email";
      ttsNormalizationRule: string;
      isRequired: boolean;
    }[] = [
      {
        name: "phone_number",
        type: "string",
        ttsNormalizationRule: "Speak each digit individually with micro-pauses (e.g. nine eight zero)",
        isRequired: true
      }
    ];

    const response = await geminiClient.generate({
      systemInstruction: `You are an Entity & Slot Target Extractor for conversational voice AI systems.
Discover all data slots (names, dates, phonetics, reference numbers) that the agent must collect.
Specify TTS normalization rules (e.g., speaking digit by digit or spelling out words).`,
      prompt: `Discover data collection slots from this input:
${serialized}

Return JSON array of objects with name, type ("string"|"number"|"date"|"email"), ttsNormalizationRule, and isRequired boolean.`
    });

    const parsed = safeParseJson(response.text, fallback);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  }
}
