// lib/compiler/blueprint/BusinessExtractor.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class BusinessExtractor {
  async extract(textOrHistory: string | any[]): Promise<{
    agentName: string;
    companyName: string;
    role: string;
    toneProfile: string[];
    contextScope: string;
    languageVariant?: string;
    context: any[];
  }> {
    const serialized = typeof textOrHistory === "string" ? textOrHistory : JSON.stringify(textOrHistory);
    const fallback = {
      agentName: "Alex",
      companyName: "Enterprise Client",
      role: "Automated Voice Coordinator",
      toneProfile: ["Calm", "Direct", "Professional"],
      contextScope: "Customer verification and logistics tracking",
      languageVariant: "English",
      context: [
        { key: "Customer_Name", label: "Customer Name", description: "Name of verified caller", source: "crm", defaultValue: "Valued Customer" }
      ]
    };

    const response = await geminiClient.generate({
      systemInstruction: `You are an enterprise Business Metadata Extractor for voice AI architectures.
Extract the core business metadata, persona style, tone profile, target language/script variant, and pre-loaded session context variables from the dialogue text.
Return JSON strictly matching the requested structure.`,
      prompt: `Extract business metadata from this text:
${serialized}

Return JSON only:
{
  "companyName": "...",
  "agentName": "...",
  "role": "...",
  "toneProfile": ["Calm", "Direct"],
  "contextScope": "...",
  "languageVariant": "English or Hindi (Devanagari)",
  "context": [{ "key": "Customer_Name", "label": "Customer Name", "description": "...", "source": "crm", "defaultValue": "..." }]
}`
    });

    const parsed = safeParseJson(response.text, fallback);
    return {
      agentName: parsed.agentName || fallback.agentName,
      companyName: parsed.companyName || fallback.companyName,
      role: parsed.role || fallback.role,
      toneProfile: Array.isArray(parsed.toneProfile) ? parsed.toneProfile : fallback.toneProfile,
      contextScope: parsed.contextScope || fallback.contextScope,
      languageVariant: parsed.languageVariant || fallback.languageVariant,
      context: Array.isArray(parsed.context) ? parsed.context : fallback.context
    };
  }
}
