import { BusinessSpecification } from "@/lib/llm/types";
import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class KnowledgeArchitect {
  public static async planKnowledge(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['knowledgeBase']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;

    const fallbackKB = {
      faqs: [
        {
          question: `What are your operating hours?`,
          answer: snap.operatingHours || `Standard business hours apply.`,
          isFallback: true
        },
        {
          question: `What services do you offer?`,
          answer: Array.isArray(snap.servicesOffered) ? snap.servicesOffered.join(", ") : `We offer comprehensive professional services.`,
          isFallback: true
        }
      ],
      objections: [
        {
          trigger: `Price or fees objection`,
          response: `Our pricing is competitive and structured around quality service. Let me connect you with our team for exact quotes.`,
          isFallback: true
        }
      ]
    };

    const prompt = `You are a KnowledgeArchitect specializing in creating structured FAQs and objection handlers for Voice AI agents.
Given the following business context, expand the details into a strict JSON object containing faqs and objections.

Business Context:
${JSON.stringify({ meta, snap }, null, 2)}

Return a JSON object with:
- faqs: array of { question: string, answer: string }
- objections: array of { trigger: string, response: string }`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are a knowledge base curation specialist. Return ONLY valid JSON.",
        prompt
      });
      const kb = safeParseJson(response.text, fallbackKB);
      return {
        faqs: Array.isArray(kb?.faqs) ? kb.faqs : fallbackKB.faqs,
        objections: Array.isArray(kb?.objections) ? kb.objections : (kb?.objections || fallbackKB.objections)
      };
    } catch (err) {
      console.warn("KnowledgeArchitect fallback triggered:", err);
      return fallbackKB;
    }
  }
}
