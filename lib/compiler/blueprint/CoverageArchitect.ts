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

    const fullUserText = chatHistory
      .filter(m => m.role.toLowerCase() === "user")
      .map(m => m.content)
      .join(" ");

    const companyStr = toStr(meta.companyName);
    const hasCompanyInHistory = /\b(called|named|clinic is|dentistry|company|business is)\s+([A-Z][a-zA-Z\s]+)/i.test(fullUserText);
    if ((!companyStr || companyStr === "Enterprise Client" || companyStr.trim() === "") && !hasCompanyInHistory) {
      missingFields.push("Company Name");
    }
    const goalStr = toStr(meta.primaryGoal);
    if (!goalStr || goalStr === "Assist callers effectively" || goalStr.trim().length < 15) {
      missingFields.push("Primary Agent Goal / Use Case");
    }
    const hasServicesInHistory = /\b(cleanings|x-rays|fillings|crowns|services|preventative|orthodontics|procedures)\b/i.test(fullUserText);
    if ((!snap.servicesOffered || !Array.isArray(snap.servicesOffered) || snap.servicesOffered.length === 0) && !hasServicesInHistory) {
      missingFields.push("Services Offered");
    }
    const hoursStr = toStr(snap.operatingHours);
    const hasHoursInHistory = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|8:00|9:00|5:00|am|pm|hours of operation)\b/i.test(fullUserText);
    if ((!hoursStr || hoursStr === "Standard Business Hours" || hoursStr === "{}" || hoursStr === "[]" || hoursStr.trim() === "") && !hasHoursInHistory) {
      missingFields.push("Operating Hours");
    }

    const hasLocation = /\b(located|street|address|maple|avenue|suite|city|zip|website)\b/i.test(fullUserText);
    if (!hasLocation) {
      missingFields.push("Physical Location & Contact Info (address, phone number, or website)");
    }

    const hasStaff = /\b(dr\.|doctor|dentist|hygienist|adams|lee|sarah|mark|practitioner|specialist|staff)\b/i.test(fullUserText) || (spec?.extractedEntities?.namedContacts && spec.extractedEntities.namedContacts.length > 0);
    if (!hasStaff) {
      missingFields.push("Staff & Practitioner Roster (names of doctors, specialists, or key departments)");
    }

    const cancelStr = toStr(snap.policies?.cancellation);
    const refundStr = toStr(snap.policies?.refunds);
    const hasCancellation = cancelStr === "None — confirmed by business" || (cancelStr && cancelStr !== "Standard cancellation policy applies." && cancelStr.trim().length > 5);
    const hasRefunds = refundStr === "None — confirmed by business" || (refundStr && refundStr !== "Standard refund policy applies." && refundStr.trim().length > 5);
    const resolved = spec?.resolvedTopics || [];
    const captured = spec?.capturedTopics || [];
    const hasResolvedPolicy = resolved.some(t => t.toLowerCase().includes("cancellation") || t.toLowerCase().includes("refund") || t.toLowerCase().includes("policy") || t.toLowerCase().includes("fee"));
    if (!hasCancellation && !hasRefunds && !hasResolvedPolicy) {
      missingFields.push("Key Business Policies / Rules (cancellation, fee, or refund details)");
    }

    const hasIntake = /\b(intake|insurance|ppo|hmo|medicaid|first time|new patient|id card|bring|verify)\b/i.test(fullUserText) || resolved.some(t => t.toLowerCase().includes("intake") || t.toLowerCase().includes("insurance"));
    if (!hasIntake) {
      missingFields.push("Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)");
    }

    const hasFaqDetail = (spec?.knowledgeBase?.faqs && spec.knowledgeBase.faqs.length >= 3) || /\b(faq|frequently asked|question|cost|price|parking|direction)\b/i.test(fullUserText);
    if (!hasFaqDetail) {
      missingFields.push("Common Caller FAQs (frequent questions about pricing, preparation, or services)");
    }

    const hasRouting = resolved.some(t => t.toLowerCase().includes("routing") || t.toLowerCase().includes("transfer") || t.toLowerCase().includes("escalat")) ||
      captured.some(c => c.topic.toLowerCase().includes("routing") || c.topic.toLowerCase().includes("transfer") || c.topic.toLowerCase().includes("escalat") || c.topic.toLowerCase().includes("after_hours"));
    if (!hasRouting) {
      missingFields.push("Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)");
    }

    const hasEdgeCases = resolved.some(t => t.toLowerCase().includes("objection") || t.toLowerCase().includes("edge_case") || t.toLowerCase().includes("pushback") || t.toLowerCase().includes("emergency")) ||
      captured.some(c => c.topic.toLowerCase().includes("objection") || c.topic.toLowerCase().includes("edge_case") || c.topic.toLowerCase().includes("pushback") || c.topic.toLowerCase().includes("emergency"));
    if (!hasEdgeCases) {
      missingFields.push("Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)");
    }

    const MIN_USER_TURNS = 10;
    const userTurnCount = chatHistory.filter(m => m.role.toLowerCase() === "user").length;
    if (userTurnCount < MIN_USER_TURNS) {
      missingFields.push("Additional In-Depth Operational Detail (interview in progress)");
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
    spec?: Partial<BusinessSpecification>,
    languageMode?: 'english' | 'hindi' | 'multilingual'
  ): Promise<string> {
    if (missingFields.length === 0) {
      return "I have all the core and in-depth operational specifications needed! Shall I compile your structured Voice AI agent prompt now?";
    }

    const vertical = spec?.meta?.industry || "General";
    const verticalProbes: Record<string, string> = {
      "Healthcare": "insurance verification scripts, appointment qualification criteria (new vs. follow-up), emergency triage protocol, HIPAA referral handling",
      "Dental": "insurance handling, acute emergency vs routine checkup slots, cancellation notice phrasing, intake form procedures, pediatric/sedation thresholds",
      "Gym/Fitness": "class scheduling restrictions, membership tier qualification, staff-led vs self-service trial bookings, guest pass verification procedures",
      "Fitness": "class scheduling restrictions, membership tier qualification, staff-led vs self-service trial bookings, guest pass verification procedures",
      "Logistics": "exact GPS tracking consent language, driver identity verification rules, dispatch escalation numbers, hazmat or over-dimension protocols",
      "Real Estate": "property viewing qualification criteria (budget, timeline, pre-approval status), agent transfer routing rules, lockbox/access scripts",
      "Hospitality": "check-in/check-out modification rules, room deposit requirements, dining/amenity reservation scripts, cancellation window exceptions",
      "Financial Services": "caller authentication steps, fraud escalation procedures, transfer criteria for loan officers or support specialists, fee structures",
      "Legal": "case intake screening questions, statute of limitations disclaimers, consultation fee collection phrasing, attorney escalation criteria"
    };
    const activeProbes = verticalProbes[vertical] || "specific operational edge cases, exact qualification questions, transfer escalation criteria, fallback procedures";

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

    const phase1Fields = missingFields.filter(f =>
      f.includes("Company Name") || f.includes("Physical Location")
    );
    const phase2Fields = missingFields.filter(f =>
      f.includes("Operating Hours") || f.includes("Staff & Practitioner Roster")
    );
    const phase3Fields = missingFields.filter(f =>
      f.includes("Services Offered") || f.includes("Primary Agent Goal") || f.includes("Intake & Qualification")
    );
    const phase4Fields = missingFields.filter(f =>
      f.includes("Key Business Policies") || f.includes("Common Caller FAQs")
    );
    const phase5Fields = missingFields.filter(f =>
      f.includes("Call Transfer") || f.includes("Edge Case") || f.includes("Additional In-Depth")
    );

    let activePhaseName = "Phase 5 (Escalation & High-Pressure Edge Cases)";
    let targetFields = phase5Fields.length > 0 ? phase5Fields : missingFields;
    let phaseInstruction = `We are in Phase 5 of discovery. Focus on high-pressure scenarios, emergency triage protocols, after-hours transfers, live agent routing conditions, or complex objection handling relevant to ${vertical} (${activeProbes}). Formulate a crisp, practical question targeting: ${targetFields[0]}.`;

    if (phase1Fields.length > 0) {
      activePhaseName = "Phase 1 (Identity & Location)";
      targetFields = phase1Fields;
      phaseInstruction = `We are in Phase 1 of discovery. Focus strictly on establishing foundational identity and location: collecting the official clinic/business name or physical location/contact info (address, phone number, website). Do NOT ask about hours, services, policies, or emergencies yet. Formulate a friendly, conversational question targeting: ${phase1Fields[0]}.`;
    } else if (phase2Fields.length > 0) {
      activePhaseName = "Phase 2 (Schedule & Team Roster)";
      targetFields = phase2Fields;
      phaseInstruction = `We are in Phase 2 of discovery. Focus strictly on establishing the schedule and team setup: exact operating days/hours or staff/practitioner roster (names of doctors, specialists, or departments). Do NOT ask about services, insurance, policies, or emergencies yet. Formulate an engaging question targeting: ${phase2Fields[0]}.`;
    } else if (phase3Fields.length > 0) {
      activePhaseName = "Phase 3 (Services & Caller Intake)";
      targetFields = phase3Fields;
      phaseInstruction = `We are in Phase 3 of discovery. Focus strictly on core offerings, service durations, or caller intake requirements (new vs existing patient screening, required ID/insurance verification). Do NOT jump into cancellation fees or emergency routing yet. Formulate a natural question targeting: ${phase3Fields[0]}.`;
    } else if (phase4Fields.length > 0) {
      activePhaseName = "Phase 4 (Policies & Common FAQs)";
      targetFields = phase4Fields;
      phaseInstruction = `We are in Phase 4 of discovery. Focus strictly on everyday rules and FAQs: cancellation windows, late fees, refund rules, or top frequent everyday questions callers ask (pricing, preparation, parking). Do NOT probe for emergency triage or live agent transfers yet. Formulate a clear, helpful question targeting: ${phase4Fields[0]}.`;
    }

    const historyText = chatHistory.slice(-50).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const langInstruction = languageMode === 'hindi'
      ? "\nLANGUAGE DIRECTIVE: Ask your question in natural conversational Hindi (Devanagari or Romanized/Hinglish)."
      : languageMode === 'multilingual'
      ? "\nLANGUAGE DIRECTIVE: Ask your question in English, noting that we are building a multilingual voice agent (English, Hindi, Hinglish)."
      : "";
    const prompt = `You are an In-Depth Question Planner AI for an advanced Voice AI Auto-Builder following a Phased Discovery Approach.
Current Discovery Stage: ${activePhaseName}
Target missing fields for this turn: ${targetFields.join(", ")}

Recent conversation history:
${historyText}

Vertical Context: ${vertical}. ${entityInstruction}${resolvedInstruction}

DISCOVERY PHASE INSTRUCTION:
${phaseInstruction}

CRITICAL RULE: Review the conversation history carefully. NEVER ask about a topic, policy, procedure, or detail that the user has already answered or explained. Formulate exactly ONE natural, conversational, and specific question to ask the user next targeting the current phase (${activePhaseName}). Keep your response warm, professional, and clear.${langInstruction}`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are an expert conversational AI interview specialist following a strict Phased Discovery Approach.",
        prompt
      });
      return response.text?.trim() || `Could you walk me through your exact procedure and guidelines regarding ${targetFields[0] || missingFields[0]}?`;
    } catch {
      return `To ensure the AI handles interactions smoothly, could you share specific details regarding: ${targetFields[0] || missingFields[0]}?`;
    }
  }
}
