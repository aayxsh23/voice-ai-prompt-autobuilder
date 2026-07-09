import { BusinessSpecification } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";

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
    const hasLanguageInHistory = /\b(english|hindi|hinglish|bilingual|multilingual|devanagari|language|dialect|speak in|talk in|voice language|kannada|tamil|telugu|marathi|gujarati|bengali|punjabi|malayalam|urdu)\b/i.test(fullUserText) || (spec?.resolvedTopics || []).some(t => t.toLowerCase().includes("language") || t.toLowerCase().includes("dialect"));
    if (!hasLanguageInHistory) {
      missingFields.push("Primary Agent Language & Dialect (English, Hindi, Hinglish, or Multilingual)");
    }
    const resolved = spec?.resolvedTopics || [];
    const captured = spec?.capturedTopics || [];

    const hasServicesInHistory = /\b(cleanings|x-rays|fillings|crowns|services|preventative|orthodontics|procedures|courses|classes|preparation|demo|software|offerings|products|modules|erp|neet|jee|foundation)\b/i.test(fullUserText) || (spec?.extractedEntities?.servicesOrOfferings && spec.extractedEntities.servicesOrOfferings.length > 0) || resolved.some(t => t.toLowerCase().includes("service") || t.toLowerCase().includes("offering") || t.toLowerCase().includes("course") || t.toLowerCase().includes("product") || t.toLowerCase().includes("module"));
    if ((!snap.servicesOffered || !Array.isArray(snap.servicesOffered) || snap.servicesOffered.length === 0) && !hasServicesInHistory) {
      missingFields.push("Services Offered");
    }
    const hoursStr = toStr(snap.operatingHours);
    const hasHoursInHistory = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|8:00|9:00|5:00|10:00|am|pm|hours|timings|timing|window|available all days|available from)\b/i.test(fullUserText) || resolved.some(t => t.toLowerCase().includes("hour") || t.toLowerCase().includes("timing") || t.toLowerCase().includes("schedule") || t.toLowerCase().includes("availability"));
    if ((!hoursStr || hoursStr === "Standard Business Hours" || hoursStr === "{}" || hoursStr === "[]" || hoursStr.trim() === "") && !hasHoursInHistory) {
      missingFields.push("Operating Hours");
    }

    const hasLocation = /\b(located|street|address|maple|avenue|suite|city|zip|website|online|digital|remote|kundanahalli|varthur|bengaluru|bangalore|phone|contact)\b/i.test(fullUserText) || resolved.some(t => t.toLowerCase().includes("location") || t.toLowerCase().includes("address") || t.toLowerCase().includes("contact") || t.toLowerCase().includes("website"));
    if (!hasLocation) {
      missingFields.push("Physical Location & Contact Info (address, phone number, or website)");
    }

    const hasStaff = /\b(dr\.|doctor|dentist|hygienist|practitioner|specialist|staff|team|counselor|counselors|manager|managers|supervisor|supervisors|representative|agent|advisor|deepika|ananya|department|departments|desk|desks|roster|refer to the team|centralized|no individual|no specific|no name|no names|does not need to mention|refer only to)\b/i.test(fullUserText) ||
      (spec?.extractedEntities?.namedContacts && spec.extractedEntities.namedContacts.length > 0) ||
      (spec?.extractedEntities?.departments && spec.extractedEntities.departments.length > 0) ||
      resolved.some(t => t.toLowerCase().includes("staff") || t.toLowerCase().includes("team") || t.toLowerCase().includes("roster") || t.toLowerCase().includes("department") || t.toLowerCase().includes("contact") || t.toLowerCase().includes("counselor")) ||
      captured.some(c => c.topic.toLowerCase().includes("staff") || c.topic.toLowerCase().includes("team") || c.topic.toLowerCase().includes("roster") || c.topic.toLowerCase().includes("department"));
    if (!hasStaff) {
      missingFields.push("Staff & Practitioner Roster (names of doctors, specialists, or key departments)");
    }

    const cancelStr = toStr(snap.policies?.cancellation);
    const refundStr = toStr(snap.policies?.refunds);
    const hasCancellation = cancelStr === "None — confirmed by business" || (cancelStr && cancelStr !== "Standard cancellation policy applies." && cancelStr.trim().length > 5);
    const hasRefunds = refundStr === "None — confirmed by business" || (refundStr && refundStr !== "Standard refund policy applies." && refundStr.trim().length > 5);
    const hasResolvedPolicy = resolved.some(t => t.toLowerCase().includes("cancellation") || t.toLowerCase().includes("refund") || t.toLowerCase().includes("policy") || t.toLowerCase().includes("fee")) ||
      captured.some(c => c.topic.toLowerCase().includes("cancellation") || c.topic.toLowerCase().includes("refund") || c.topic.toLowerCase().includes("policy") || c.topic.toLowerCase().includes("fee")) ||
      /\b(policy|policies|cancellation|refund|fee|fees|discount|scholarship|terms|rules|no policy|does not need to mention|not required|none)\b/i.test(fullUserText);
    if (!hasCancellation && !hasRefunds && !hasResolvedPolicy) {
      missingFields.push("Key Business Policies / Rules (cancellation, fee, or refund details)");
    }

    const hasIntake = /\b(intake|insurance|ppo|hmo|medicaid|first time|new patient|id card|bring|verify|qualification|qualify|qualifying|class|exam|goal|preparation|pincode|pin code|preference|requirements|screening|question|questions)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("intake") || t.toLowerCase().includes("insurance") || t.toLowerCase().includes("qualification") || t.toLowerCase().includes("screening")) ||
      captured.some(c => c.topic.toLowerCase().includes("intake") || c.topic.toLowerCase().includes("qualification"));
    if (!hasIntake) {
      missingFields.push("Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)");
    }

    const hasInfields = /\b(infield|infields|pre-call|pre call|crm variable|crm data|before the call|already know|caller_name|is_business_owner|lead_source|no infield|no infields|zero infield|none required|no pre-call|no pre call)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("infield") || t.toLowerCase().includes("pre-call") || t.toLowerCase().includes("crm")) ||
      captured.some(c => c.topic.toLowerCase().includes("infield") || c.topic.toLowerCase().includes("pre-call") || c.topic.toLowerCase().includes("crm"));
    if (!hasInfields) {
      missingFields.push("Infields & Pre-Call CRM Context Variables (data provided to the agent before the call begins, e.g. caller name, business status, lead info)");
    }

    const hasFaqDetail = (spec?.knowledgeBase?.faqs && spec.knowledgeBase.faqs.length >= 2) ||
      /\b(faq|frequently asked|question|cost|price|pricing|parking|direction|query|queries|answer|answers)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("faq") || t.toLowerCase().includes("question")) ||
      captured.some(c => c.topic.toLowerCase().includes("faq"));
    if (!hasFaqDetail) {
      missingFields.push("Common Caller FAQs (frequent questions about pricing, preparation, or services)");
    }

    const hasRouting = resolved.some(t => t.toLowerCase().includes("routing") || t.toLowerCase().includes("transfer") || t.toLowerCase().includes("escalat") || t.toLowerCase().includes("after_hours")) ||
      captured.some(c => c.topic.toLowerCase().includes("routing") || c.topic.toLowerCase().includes("transfer") || c.topic.toLowerCase().includes("escalat") || c.topic.toLowerCase().includes("after_hours")) ||
      /\b(route|routing|transfer|transferred|escalate|escalated|escalation|connect with|route to|senior counselor|support team|follow-up|callback|call back|schedule callback)\b/i.test(fullUserText);
    if (!hasRouting) {
      missingFields.push("Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)");
    }

    const hasEdgeCases = resolved.some(t => t.toLowerCase().includes("objection") || t.toLowerCase().includes("edge_case") || t.toLowerCase().includes("pushback") || t.toLowerCase().includes("emergency")) ||
      captured.some(c => c.topic.toLowerCase().includes("objection") || c.topic.toLowerCase().includes("edge_case") || c.topic.toLowerCase().includes("pushback") || c.topic.toLowerCase().includes("emergency")) ||
      (spec?.knowledgeBase?.objections && spec.knowledgeBase.objections.length >= 1) ||
      /\b(objection|objections|busy|not interested|fees|already enrolled|pushback|concern|concerns|reject|rejection|upset|confused|edge case)\b/i.test(fullUserText);
    if (!hasEdgeCases) {
      missingFields.push("Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)");
    }

    // --- Checkpoints 14 to 27 ---
    const callFlowSteps = spec?.callFlowPlan?.userDefinedSteps || spec?.callFlowPlan?.steps || [];
    const hasCallFlowSkeleton = callFlowSteps.length > 0 ||
      /\b(call flow|flow skeleton|step 1|greeting then|template|branching|first step|next step|walk through)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("flow") || t.toLowerCase().includes("skeleton") || t.toLowerCase().includes("template"));
    if (!hasCallFlowSkeleton) {
      missingFields.push("Call Flow Skeleton (greeting, step sequence, branches, or template selection)");
    }

    const hasOpeningPhrase = !!meta.openingPhrase ||
      /\b(say hello|open with|opening phrase|start by saying|greeting script|greet caller with|opening line)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("opening") || t.toLowerCase().includes("greeting"));
    if (!hasOpeningPhrase) {
      missingFields.push("Opening Line / Greeting Script (exact opening phrasing)");
    }

    const hasClosingScript = !!spec?.callFlowPlan?.closingScript ||
      /\b(closing script|wrap up|say goodbye|end the call with|closing phrase|closing line|no special closing|standard goodbye|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("closing") || t.toLowerCase().includes("wrap"));
    if (!hasClosingScript) {
      missingFields.push("Closing Line / Call Wrap-up Script (exact closing phrasing or N/A)");
    }

    const hasSilenceHandling = !!spec?.callFlowPlan?.silenceHandling ||
      /\b(silence|no input|doesn't answer|quiet|timeout|reprompt|re-prompt|no-input|if caller says nothing|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("silence") || t.toLowerCase().includes("timeout"));
    if (!hasSilenceHandling) {
      missingFields.push("No-Input / Silence Handling (timeout seconds, reprompt action, or N/A)");
    }

    const hasInterruptionPolicy = !!spec?.callFlowPlan?.interruptionPolicy ||
      /\b(barge in|barge-in|interrupt|interruption|talk over|cut off|allow interruption|do not interrupt|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("interrupt") || t.toLowerCase().includes("barge"));
    if (!hasInterruptionPolicy) {
      missingFields.push("Interruption / Barge-in Behavior (allow interruption vs disallow, or N/A)");
    }

    const hasDigressionPolicy = !!spec?.callFlowPlan?.digressionPolicy ||
      /\b(digress|off topic|off-topic|mid flow|mid-flow|tangent|answer and return|return to script|resume where left off|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("digress") || t.toLowerCase().includes("tangent"));
    if (!hasDigressionPolicy) {
      missingFields.push("Mid-Flow Digression Handling (answer off-script question then resume vs refuse, or N/A)");
    }

    const hasRetryExhaustion = callFlowSteps.some((s: any) => s?.onFailure?.action || s?.onFailure?.target) ||
      /\b(after 3 retries|max retries|retry limit|three failures|failed attempts|if caller can't provide|give up and transfer|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("retry") || t.toLowerCase().includes("exhaustion"));
    if (!hasRetryExhaustion) {
      missingFields.push("Retry Exhaustion Fallback (action after max retries per slot e.g. transfer/hangup)");
    }

    const hasConfirmationStyle = !!spec?.callFlowPlan?.confirmationStyle ||
      /\b(read back|confirm back|character by character|digit by digit|repeat back|confirm phone number|confirmation style|no readback|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("confirmation") || t.toLowerCase().includes("readback"));
    if (!hasConfirmationStyle) {
      missingFields.push("Confirmation & Read-back Style (character-by-character vs summary, or N/A)");
    }

    const hasVoicePersona = !!meta.voiceCharacteristics ||
      /\b(pacing|fast|slow|formality|formal|casual|filler words|um|uh|accent|british|american|indian accent|voice style|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("voice") || t.toLowerCase().includes("persona") || t.toLowerCase().includes("pacing"));
    if (!hasVoicePersona) {
      missingFields.push("Voice & Persona Characteristics (pacing, formality, accent, or N/A)");
    }

    const hasDisclosures = (snap.policies?.disclosures && snap.policies.disclosures.length > 0) ||
      (spec?.guardrails?.disclosures && spec.guardrails.disclosures.length > 0) ||
      /\b(disclosure|disclose|recorded call|recording consent|ai disclosure|state that you are ai|compliance notice|no disclosure|not regulated|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("disclosure") || t.toLowerCase().includes("consent") || t.toLowerCase().includes("compliance"));
    if (!hasDisclosures) {
      missingFields.push("Consent & Compliance Disclosures (recording consent, AI identity disclosure, or N/A)");
    }

    const hasDtmfFallback = !!spec?.callFlowPlan?.dtmfFallback ||
      /\b(dtmf|keypad|press 1|type digits|keypad entry|touch tone|if speech fails use keypad|no dtmf|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("dtmf") || t.toLowerCase().includes("keypad"));
    if (!hasDtmfFallback) {
      missingFields.push("DTMF / Keypad Input Fallback (keypad entry fallback after speech recognition failure, or N/A)");
    }

    const hasHolidayHours = (typeof snap.operatingHours === 'object' && snap.operatingHours?.exceptions && snap.operatingHours.exceptions.length > 0) ||
      (snap.exceptions && snap.exceptions.length > 0) ||
      /\b(holiday|holidays|exceptions|closed on|christmas|new year|national holiday|no special holiday hours|standard only|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("holiday") || t.toLowerCase().includes("exception"));
    if (!hasHolidayHours) {
      missingFields.push("Holiday / Exception Hours (special closures, holiday schedules, or N/A)");
    }

    const hasEntryRouting = (spec?.callFlowPlan?.entryRouting && spec.callFlowPlan.entryRouting.length > 0) ||
      /\b(entry routing|multiple request types|if caller says cancel|if caller says book|branching from start|single request type only|one flow only|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("entry") || t.toLowerCase().includes("routing") || t.toLowerCase().includes("multi-request"));
    if (!hasEntryRouting) {
      missingFields.push("Entry Routing & Multi-Request Branching (how distinct request types branch from opening, or single flow N/A)");
    }

    const hasInjectionResistance = !!spec?.guardrails?.injectionResistance ||
      /\b(injection|jailbreak|override|ignore instructions|reveal prompt|bypass rules|security prompt|default guardrails|n\/a)\b/i.test(fullUserText) ||
      resolved.some(t => t.toLowerCase().includes("injection") || t.toLowerCase().includes("jailbreak") || t.toLowerCase().includes("resistance"));
    if (!hasInjectionResistance) {
      missingFields.push("Prompt Injection & Override Resistance (behavior when caller attempts to override rules/role, or default applied)");
    }

    const userTurnCount = chatHistory.filter(m => m.role.toLowerCase() === "user").length;
    if (missingFields.length > 0 && userTurnCount < 5) {
      if (!missingFields.includes("Additional In-Depth Operational Detail (interview in progress)")) {
        missingFields.push("Additional In-Depth Operational Detail (interview in progress)");
      }
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
      return "I have all the core and in-depth operational specifications needed! Automatically generating your structured Voice AI agent prompt now...";
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

    const topic1Fields = missingFields.filter(f =>
      f.includes("Company Name") || f.includes("Physical Location") || f.includes("Primary Agent Language")
    );
    const topic2Fields = missingFields.filter(f =>
      f.includes("Operating Hours") || f.includes("Staff & Practitioner Roster") || f.includes("Holiday / Exception Hours")
    );
    const topic3Fields = missingFields.filter(f =>
      f.includes("Services Offered") || f.includes("Primary Agent Goal") || f.includes("Intake & Qualification") || f.includes("Infields & Pre-Call") || f.includes("Common Caller FAQs")
    );
    const topic4Fields = missingFields.filter(f =>
      f.includes("Key Business Policies") || f.includes("Call Transfer") || f.includes("Edge Case") || f.includes("Consent & Compliance") || f.includes("Voice & Persona") || f.includes("Prompt Injection")
    );
    const topicCallFlowFields = missingFields.filter(f =>
      f.includes("Call Flow Skeleton") || f.includes("Opening Line") || f.includes("Closing Line") || f.includes("No-Input / Silence") || f.includes("Interruption / Barge-in") || f.includes("Mid-Flow Digression") || f.includes("Retry Exhaustion") || f.includes("Confirmation & Read-back") || f.includes("DTMF / Keypad") || f.includes("Entry Routing")
    );

    let activeTopicGroup = "Call Flow Design & Conversational Mechanics";
    let targetFields = topicCallFlowFields.length > 0 ? topicCallFlowFields : missingFields;
    let topicInstruction = `We are designing the conversational call flow and dialogue mechanics for ${vertical}. Specifically, ask a guided question targeting: ${targetFields[0]}. If asking about Call Flow Skeleton, offer them a standard industry 5-step template vs building from scratch. If asking about Interruption/Digression or Silence Handling, ask directly what the agent should do when interrupted, off-script, or met with silence.`;

    if (topic1Fields.length > 0) {
      activeTopicGroup = "Identity, Language & Location";
      targetFields = topic1Fields;
      topicInstruction = `We are exploring foundational identity, language, and location details: collecting the official clinic/business name, physical location/contact info (address, phone number, website), or the primary language/dialect the agent should speak (e.g., English, Hindi, Hinglish, or multilingual). Do NOT ask about hours, services, policies, or call flow yet. Formulate a friendly, conversational question targeting: ${topic1Fields[0]}.`;
    } else if (topic2Fields.length > 0) {
      activeTopicGroup = "Schedule & Team Setup";
      targetFields = topic2Fields;
      topicInstruction = `We are exploring the schedule and team setup: exact operating days/hours, holiday/exception hours, or staff/practitioner roster (names of doctors, specialists, or departments). Do NOT ask about call flow or policies yet. Formulate an engaging question targeting: ${topic2Fields[0]}.`;
    } else if (topic3Fields.length > 0) {
      activeTopicGroup = "Services, Caller Intake & Pre-Call Infields";
      targetFields = topic3Fields;
      topicInstruction = `We are exploring core offerings, caller intake requirements, FAQs, or Pre-Call CRM Context Variables (Infields — data passed to the agent before the call begins, such as caller_name, business status, or lead source). If targeting Infields, ask specifically what CRM variables/infields will be passed to the agent before the call begins (or if none will be passed). Do NOT jump into cancellation fees or call flow yet. Formulate a natural question targeting: ${topic3Fields[0]}.`;
    } else if (topic4Fields.length > 0) {
      activeTopicGroup = "Policies, Edge Cases & Guardrails";
      targetFields = topic4Fields;
      topicInstruction = `We are exploring everyday rules, transfer routing, edge case/objection handling, consent disclosures, voice pacing/persona, or prompt injection guardrails. Formulate a clear, helpful question targeting: ${topic4Fields[0]}.`;
    }

    const historyText = chatHistory.slice(-50).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const langInstruction = languageMode === 'hindi'
      ? "\nLANGUAGE DIRECTIVE: Ask your question in natural conversational Hindi (Devanagari or Romanized/Hinglish)."
      : languageMode === 'multilingual'
      ? "\nLANGUAGE DIRECTIVE: Ask your question in English, noting that we are building a multilingual voice agent (English, Hindi, Hinglish)."
      : "";
    const prompt = `You are a Conversational AI Architect interviewing a user to build a Voice AI agent.
Current Topic Focus: ${activeTopicGroup}
Target missing detail for this question: ${targetFields[0]}

Recent conversation history:
${historyText}

Vertical Context: ${vertical}. ${entityInstruction}${resolvedInstruction}

TOPIC FOCUS INSTRUCTION:
${topicInstruction}

CRITICAL RULES FOR YOUR RESPONSE:
1. NO STAGE OR PHASE MENTIONS: Absolutely NEVER mention words like 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Topic Group', or any stage/phase numbers or names in your response to the user.
2. NO TRANSITION ANNOUNCEMENTS OR SUMMARIES: Do NOT announce that a stage is completed, and do NOT recite or summarize what has already been completed or locked in (e.g. NEVER say "Since we have already confirmed X, we have completed Stage Y and are ready for Z...").
3. DIRECT, NATURAL CONVERSATIONAL QUESTION: Directly and warmly ask exactly ONE natural, conversational question to gather the target missing detail (${targetFields[0]}). Keep the flow smooth and human-like without any robotic boilerplate or meta-commentary.
4. AVOID REPETITION: Review the conversation history carefully. NEVER ask about a topic, policy, procedure, or detail that the user has already answered or explained.${langInstruction}`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are an expert conversational AI architect building a Voice AI agent through an interactive interview. CRITICAL BEHAVIORAL RULE: NEVER mention 'Phase 1', 'Phase 2', 'Discovery Stage', 'transition', or any internal phase/stage numbers or names to the user. Never recite summaries of completed steps just to announce moving forward. Simply ask the next logical question in a warm, direct, conversational manner.",
        prompt
      });
      let text = response.text?.trim() || `Could you walk me through your exact procedure and guidelines regarding ${targetFields[0] || missingFields[0]}?`;
      text = text.replace(/^(?:Since we have (?:already )?(?:confirmed|established|covered|completed|finalized).*?we are ready to (?:officially )?(?:transition|move)(?: on)? (?:in)?to .*?[\.\?\!]\s*)/i, "");
      text = text.replace(/\b(?:Phase|Stage)\s*\d+(?:\s*\([^)]+\))?:?\s*/gi, "");
      return text.trim();
    } catch {
      return `To ensure the AI handles interactions smoothly, could you share specific details regarding: ${targetFields[0] || missingFields[0]}?`;
    }
  }
}
