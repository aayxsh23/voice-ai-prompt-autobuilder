import { BusinessSpecification } from "@/lib/llm/types";
import { geminiClient } from "@/lib/llm/geminiProvider";

export interface CoverageReport {
  missingFields: string[];
  isReadyForCompilation: boolean;
  nextQuestion?: string;
}

export class CoverageArchitect {
  public static evaluate(
    spec: Partial<BusinessSpecification>,
    chatHistory: Array<{ role: string; content: string }> = []
  ): CoverageReport {
    const missingFields: string[] = [];

    const meta = spec.meta || {} as Partial<BusinessSpecification['meta']>;
    const snap = spec.businessSnapshot || {} as Partial<BusinessSpecification['businessSnapshot']>;
    const faqs = (spec.knowledgeBase?.faqs || []).filter((f: Record<string, unknown>) => !f.isFallback);

    const toStr = (val: unknown): string => {
      if (typeof val === 'string') return val;
      if (val === null || val === undefined) return "";
      if (typeof val === 'object') {
        try { return JSON.stringify(val); } catch { return ""; }
      }
      return String(val);
    };

    const companyStr = toStr(meta.companyName);
    if (!companyStr || companyStr === "Enterprise Client" || companyStr.trim() === "") {
      missingFields.push("Company Name");
    }
    const goalStr = toStr(meta.primaryGoal);
    if (!goalStr || goalStr === "Assist callers effectively" || goalStr.trim().length < 15) {
      missingFields.push("Primary Agent Goal / Use Case");
    }
    if (!snap.servicesOffered || !Array.isArray(snap.servicesOffered) || snap.servicesOffered.length === 0) {
      missingFields.push("Services Offered");
    }
    const hoursStr = toStr(snap.operatingHours);
    if (!hoursStr || hoursStr === "Standard Business Hours" || hoursStr === "{}" || hoursStr === "[]" || hoursStr.trim() === "") {
      missingFields.push("Operating Hours");
    }
    const cancelStr = toStr(snap.policies?.cancellation);
    const refundStr = toStr(snap.policies?.refunds);
    const hasCancellation = cancelStr === "None — confirmed by business" || (cancelStr && cancelStr !== "Standard cancellation policy applies." && cancelStr.trim().length > 5);
    const hasRefunds = refundStr === "None — confirmed by business" || (refundStr && refundStr !== "Standard refund policy applies." && refundStr.trim().length > 5);
    const resolved = spec?.resolvedTopics || [];
    const hasResolvedPolicy = resolved.some(t => t.toLowerCase().includes("cancellation") || t.toLowerCase().includes("refund") || t.toLowerCase().includes("policy") || t.toLowerCase().includes("fee"));
    if (!hasCancellation && !hasRefunds && !hasResolvedPolicy) {
      missingFields.push("Key Business Policies / Rules (cancellation or refund details)");
    }

    const MIN_USER_TURNS = 4;
    const userTurnCount = chatHistory.filter(m => m.role.toLowerCase() === "user").length;
    if (userTurnCount < MIN_USER_TURNS) {
      missingFields.push("Additional Business Detail (interview in progress)");
    }

    const isReadyForCompilation = missingFields.length === 0;

    return {
      missingFields,
      isReadyForCompilation
    };
  }

  public static async generateNextQuestion(
    missingFields: string[],
    chatHistory: Array<{ role: string; content: string }>,
    spec?: Partial<BusinessSpecification>
  ): Promise<string> {
    if (missingFields.length === 0) {
      return "I have all the core business specifications needed! Shall I compile your structured Voice AI agent prompt now?";
    }

    const vertical = spec?.meta?.industry || "General";
    const verticalProbes: Record<string, string> = {
      "Healthcare": "insurance handling, appointment types (new vs. follow-up), emergency protocol, referral handling",
      "Dental": "insurance handling, routine checkup vs acute emergency slots, cancellation notice, intake forms",
      "Gym/Fitness": "class scheduling vs. personal training vs. day passes, membership tiers, staff-led booking vs. self-service, trial policy",
      "Fitness": "class scheduling vs. personal training vs. day passes, membership tiers, staff-led booking vs. self-service, trial policy",
      "Logistics": "GPS consent language, dispatch escalation, driver verification steps, delivery windows",
      "Real Estate": "property viewing scheduling, qualification questions (budget, timeline, pre-approval), agent transfer rules",
      "Hospitality": "check-in/check-out times, room types, amenity bookings, dining reservations, deposit policy"
    };
    const activeProbes = verticalProbes[vertical] || "specific operational guidelines, common caller inquiries, transfer escalation numbers";

    const entities = spec?.extractedEntities;
    const namedItems = [
      ...(entities?.departments || []),
      ...(entities?.servicesOrOfferings || []),
      ...(entities?.namedContacts?.map(c => `${c.label} (${c.value})`) || [])
    ];
    const entityInstruction = namedItems.length > 0
      ? `\nThe user has already mentioned these specific departments/services/contacts: ${namedItems.join(", ")}. If a missing field relates to any of them (e.g. transfer routing, contact details), reference them by name specifically instead of asking a generic question.`
      : "";

    const resolvedTopics = spec?.resolvedTopics || [];
    const capturedTags = (spec?.capturedTopics || []).map(c => c.topic);
    const coveredTags = Array.from(new Set([...resolvedTopics, ...capturedTags]));
    const resolvedInstruction = coveredTags.length > 0
      ? `\nThese topics have already been covered in this conversation: ${coveredTags.join(", ")}. Do not ask about any of them again unless the user's most recent message suggests a correction or contradiction.`
      : "";

    const historyText = chatHistory.slice(-20).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const prompt = `You are a Question Planner AI for a Voice AI Auto-Builder.
We are currently missing the following core business specification fields:
${missingFields.join(", ")}

Recent conversation history:
${historyText}

Given this business is in the following vertical: ${vertical}. Prioritize asking about: ${activeProbes}, unless already covered.${entityInstruction}${resolvedInstruction}

CRITICAL RULE: Review the conversation history carefully. NEVER ask about a topic, policy, procedure, or vertical probe that the user has already answered or explained in the chat history. Formulate exactly ONE natural, conversational, and professional question to ask the user next to collect 1 or 2 of these missing fields. Do not stack multiple complex questions. Keep it concise.`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are an expert conversational AI interview specialist.",
        prompt
      });
      return response.text?.trim() || `Could you please tell me more about your ${missingFields[0]}?`;
    } catch {
      return `To tailor the agent properly, could you please provide details regarding: ${missingFields.join(", ")}?`;
    }
  }
}
