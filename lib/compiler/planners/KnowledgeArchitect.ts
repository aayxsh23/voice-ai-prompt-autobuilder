import { BusinessSpecification } from "@/lib/llm/types";
import { llmClient } from "@/lib/llm/llmProvider";
import { safeParseJson } from "@/lib/llm/types";
import { logger } from "@/lib/logger";

export class KnowledgeArchitect {
  public static async planKnowledge(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['knowledgeBase']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;
    const languageMode = meta.languageMode || (spec as any).languageMode || 'english';
    // Primary output language follows the declared mode only (a multilingual/English
    // agent generates English FAQs and switches to Hindi live).
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish';

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
      ? `\nCRITICAL LANGUAGE DIRECTIVE:\nThis voice agent communicates in Hindi/Hinglish (languageMode '${languageMode}' / operational protocols). EVERY SINGLE FAQ answer (answer) and objection handling response (response) MUST be written in Devanagari script (देवनागरी), NOT English/Roman script.\nENGLISH WORDS RULE: Any word originating from English (such as WhatsApp, registered, training, billing, software, demo, email, phone, callback, status, schedule, slot, reach, team, number, etc.) MUST remain in Roman/English script within the Devanagari sentence. NEVER transliterate English words into Devanagari. Example: "हमारा registered office Delhi में है।" NOT "हमारा रजिस्टर्ड ऑफिस दिल्ली में है।"`
      : "";

    const prompt = `You are a KnowledgeArchitect specializing in creating structured FAQs and objection handlers (edge cases) for Voice AI agents.
Given the following business context and existing knowledge base, expand the details into a strict JSON object containing missing faqs and objections. ${langDirective}

Business Context:
${JSON.stringify({ 
  meta, 
  snap, 
  existingKnowledgeBase: spec.knowledgeBase || {}, 
  capturedTopics: spec.capturedTopics || [], 
  resolvedTopics: spec.resolvedTopics || [], 
  scopeExclusions: meta?.scopeExclusions || [] 
}, null, 2)}

MANDATORY RULES:
1. If any policy value in the business snapshot is 'None — confirmed by business', 'None — not specified', 'Standard cancellation policy applies.', or 'Standard refund policy applies.', do NOT generate FAQ entries about that topic! Only generate FAQs for topics where real, custom details were explicitly provided by the user.
2. If any topic is listed in 'scopeExclusions' (${meta?.scopeExclusions && meta.scopeExclusions.length > 0 ? JSON.stringify(meta.scopeExclusions) : "[]"}), strictly skip it and do NOT generate FAQs or objection handlers for it.
3. CRITICAL: Never summarize, abstract, or omit exact addresses, phone numbers, exact locations, or URLs provided by the user. They must be preserved verbatim in the FAQs.
4. EXHAUSTIVE EXTRACTION & EDGE CASES: Analyze the business context and generate a distinct FAQ or Objection handler for EVERY SINGLE item or edge case that might arise. Ensure you generate edge cases (objections) based on the business context provided. DO NOT duplicate items already present in the existingKnowledgeBase.
5. You are augmenting the existing knowledge base. Only output the NEW faqs and objections you are adding.

Return a JSON object with:
- faqs: array of { question: string, answer: string (in exact target language) }
- objections: array of { trigger: string, response: string (in exact target language) }`;

    try {
      const response = await llmClient.generate({
        systemInstruction: `You are a knowledge base curation specialist. Return ONLY valid JSON.${isHindiOrHinglish ? " All FAQ answers and objection responses MUST be written in Devanagari script (देवनागरी). ENGLISH WORDS RULE: Any word originating from English (WhatsApp, registered, training, billing, software, demo, email, phone, callback, status, schedule, slot, reach, team, etc.) MUST remain in Roman/English script inside the Devanagari sentence. NEVER transliterate English words to Devanagari." : ""}`,
        prompt,
        responseMimeType: "application/json",
        contextLabel: "KnowledgeArchitect",
        sessionId: meta.sessionId
      });
      const kb = safeParseJson(response.text, fallbackKB);
      const rawFaqs = Array.isArray(kb?.faqs) ? kb.faqs : [];
      const rawObjs = Array.isArray(kb?.objections) ? kb.objections : [];
      
      const newFaqs = rawFaqs.map((f: any) => ({
        question: f?.question || f?.q || "General FAQ",
        answer: f?.answer || f?.a || "Standard policy applies.",
        isFallback: !!f?.isFallback
      }));
      
      const newObjs = rawObjs.map((o: any) => ({
        trigger: o?.trigger || o?.objection || "General objection",
        response: o?.response || o?.handling || "Address calmly and assist.",
        isFallback: !!o?.isFallback
      }));

      return {
        faqs: [...(spec.knowledgeBase?.faqs || []), ...newFaqs],
        objections: [...(spec.knowledgeBase?.objections || []), ...newObjs]
      };
    } catch (err) {
      logger.warn("KnowledgeArchitect fallback triggered", err);
      return fallbackKB;
    }
  }
}
