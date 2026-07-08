import { BusinessSpecification } from "@/lib/llm/types";
import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class KnowledgeArchitect {
  public static async planKnowledge(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['knowledgeBase']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;
    const languageMode = meta.languageMode || (spec as any).languageMode || 'english';
    const capturedText = JSON.stringify(spec.capturedTopics || []) + JSON.stringify(spec.resolvedTopics || []);
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish' || /hindi|hinglish/i.test(capturedText);

    const fallbackKB = isHindiOrHinglish ? {
      faqs: [
        {
          question: `आपके operating hours क्या हैं?`,
          answer: snap.operatingHours ? `हमारे operating hours ${snap.operatingHours} हैं।` : `हम standard business hours के दौरान available रहते हैं।`,
          isFallback: true
        },
        {
          question: `आप क्या services offer करते हैं?`,
          answer: Array.isArray(snap.servicesOffered) && snap.servicesOffered.length > 0 ? `हम ${snap.servicesOffered.join(", ")} offer करते हैं।` : `हम comprehensive business operations और software solutions offer करते हैं।`,
          isFallback: true
        }
      ],
      objections: [
        {
          trigger: `मैं interested नहीं हूँ (Not interested)`,
          response: `कोई बात नहीं, मैं समझ सकती हूँ। अगर आपको भविष्य में कभी ERP software या business solutions की ज़रूरत हो, तो हमसे ज़रूर संपर्क करें। आपका दिन शुभ हो!`,
          isFallback: true
        },
        {
          trigger: `बहुत busy हूँ (Too busy right now)`,
          response: `मैं समझ सकती हूँ कि आपका समय कीमती है। क्या मैं आपको किसी और समय call back करूँ, या हम एक छोटा online demo आपके free time के अनुसार schedule कर लें?`,
          isFallback: true
        }
      ]
    } : {
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

    const langDirective = isHindiOrHinglish
      ? `\nCRITICAL LANGUAGE DIRECTIVE:\nThis voice agent communicates in Hindi/Hinglish (languageMode '${languageMode}' / operational protocols). EVERY SINGLE FAQ answer (answer) and objection handling response (response) MUST be written in Devanagari script (देवनागरी), NOT English/Roman script. ONLY specific English domain/business terms (like 'online demo', 'software', 'team', 'ERP') can be written in English letters. NEVER generate Hindi sentences using Romanized English script.`
      : "";

    const prompt = `You are a KnowledgeArchitect specializing in creating structured FAQs and objection handlers for Voice AI agents.
Given the following business context, expand the details into a strict JSON object containing faqs and objections.${langDirective}

Business Context:
${JSON.stringify({ meta, snap, capturedTopics: spec.capturedTopics || [], resolvedTopics: spec.resolvedTopics || [] }, null, 2)}

Return a JSON object with:
- faqs: array of { question: string, answer: string (in exact target language) }
- objections: array of { trigger: string, response: string (in exact target language) }`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: `You are a knowledge base curation specialist. Return ONLY valid JSON.${isHindiOrHinglish ? " All FAQ answers and objection responses MUST be written in Devanagari script (देवनागरी). Only specific technical/business terms can remain in English." : ""}`,
        prompt,
        responseMimeType: "application/json"
      });
      const kb = safeParseJson(response.text, fallbackKB);
      const rawFaqs = Array.isArray(kb?.faqs) && kb.faqs.length > 0 ? kb.faqs : fallbackKB.faqs;
      const rawObjs = Array.isArray(kb?.objections) && kb.objections.length > 0 ? kb.objections : fallbackKB.objections;
      return {
        faqs: rawFaqs.map((f: any) => ({
          question: f?.question || f?.q || "General FAQ",
          answer: f?.answer || f?.a || "Standard policy applies.",
          isFallback: !!f?.isFallback
        })),
        objections: rawObjs.map((o: any) => ({
          trigger: o?.trigger || o?.objection || "General objection",
          response: o?.response || o?.handling || "Address calmly and assist.",
          isFallback: !!o?.isFallback
        }))
      };
    } catch (err) {
      console.warn("KnowledgeArchitect fallback triggered:", err);
      return fallbackKB;
    }
  }
}
