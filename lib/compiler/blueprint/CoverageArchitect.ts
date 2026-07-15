import { BusinessSpecification } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";

export interface CoverageReport {
  missingFields: string[];
  isReadyForCompilation: boolean;
  nextQuestion?: string;
}

const INTERVIEW_IN_PROGRESS = "Additional In-Depth Operational Detail (interview in progress)";

/** Exact label of the language coverage field. Load-bearing: matched verbatim in
 *  generateNextQuestion to force the language question first, and asserted in the
 *  behavior snapshot — keep this string identical if edited. */
const LANGUAGE_FIELD_LABEL = "Primary Agent Language & Dialect (English, Hindi, Hinglish, or Multilingual)";

/** Topic buckets used to sequence the discovery interview (see generateNextQuestion). */
type TopicGroup = "identity" | "schedule" | "services" | "policies" | "callflow";

/** Everything a coverage predicate needs, derived once per evaluate() call. */
interface CoverageContext {
  spec: Partial<BusinessSpecification>;
  meta: Partial<BusinessSpecification["meta"]>;
  snap: Partial<BusinessSpecification["businessSnapshot"]>;
  resolved: string[];
  captured: Array<{ topic: string; summary: string }>;
  fullUserText: string;
  containsAny: (words: string[]) => boolean;
  companyStr: string;
  goalStr: string;
  hoursStr: string;
  cancelStr: string;
  refundStr: string;
  callFlowSteps: any[];
}

interface CoverageRule {
  id: string;
  /** Exact human-readable label pushed into missingFields (load-bearing downstream). */
  label: string;
  group: TopicGroup;
  /** Returns true when the field is NOT yet covered. Ported verbatim from the
   *  original if-ladder — behavior must stay byte-for-byte identical. */
  missing: (ctx: CoverageContext) => boolean;
}

/**
 * The discovery coverage checklist, as data. Order is significant: missingFields
 * is produced by filtering this list top-to-bottom, and both generateNextQuestion
 * and the builder UI depend on that order.
 */
const COVERAGE_RULES: CoverageRule[] = [
  {
    id: "company_name", label: "Company Name", group: "identity",
    missing: (c) =>
      (!c.companyStr || c.companyStr === "Enterprise Client" || c.companyStr.trim() === "") &&
      !/\b(called|named|clinic is|dentistry|company|business is)\s+([A-Z][a-zA-Z\s]+)/i.test(c.fullUserText),
  },
  {
    id: "primary_goal", label: "Primary Agent Goal / Use Case", group: "services",
    missing: (c) => !c.goalStr || c.goalStr === "Assist callers effectively" || c.goalStr.trim().length < 15,
  },
  {
    id: "language", label: LANGUAGE_FIELD_LABEL, group: "identity",
    missing: (c) => !(
      /\b(english|hindi|hinglish|bilingual|multilingual|devanagari|language|dialect|speak in|talk in|voice language|kannada|tamil|telugu|marathi|gujarati|bengali|punjabi|malayalam|urdu)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("language") || t.toLowerCase().includes("dialect")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("language") || cc.topic.toLowerCase().includes("dialect"))
    ),
  },
  {
    id: "services", label: "Services Offered", group: "services",
    missing: (c) =>
      (!c.snap.servicesOffered || !Array.isArray(c.snap.servicesOffered) || c.snap.servicesOffered.length === 0) &&
      !(
        /\b(cleanings|x-rays|fillings|crowns|services|preventative|orthodontics|procedures|courses|classes|preparation|demo|software|offerings|products|modules|erp|neet|jee|foundation)\b/i.test(c.fullUserText) ||
        c.containsAny(['सेवा', 'सर्विस', 'कोर्स', 'क्लास', 'डेमो', 'सॉफ्टवेयर', 'प्रोडक्ट', 'इलाज', 'उत्पाद']) ||
        (!!c.spec?.extractedEntities?.servicesOrOfferings && c.spec.extractedEntities.servicesOrOfferings.length > 0) ||
        c.resolved.some(t => t.toLowerCase().includes("service") || t.toLowerCase().includes("offering") || t.toLowerCase().includes("course") || t.toLowerCase().includes("product") || t.toLowerCase().includes("module")) ||
        c.captured.some(cc => cc.topic.toLowerCase().includes("service") || cc.topic.toLowerCase().includes("offering") || cc.topic.toLowerCase().includes("course") || cc.topic.toLowerCase().includes("product") || cc.topic.toLowerCase().includes("module"))
      ),
  },
  {
    id: "operating_hours", label: "Operating Hours", group: "schedule",
    missing: (c) =>
      (!c.hoursStr || c.hoursStr === "Standard Business Hours" || c.hoursStr === "{}" || c.hoursStr === "[]" || c.hoursStr.trim() === "") &&
      !(
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|8:00|9:00|5:00|10:00|am|pm|hours|timings|timing|window|available all days|available from)\b/i.test(c.fullUserText) ||
        c.containsAny(['बजे', 'सुबह', 'शाम', 'समय', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार', 'खुला', 'बंद', 'घंटे', 'टाइम']) ||
        c.resolved.some(t => t.toLowerCase().includes("hour") || t.toLowerCase().includes("timing") || t.toLowerCase().includes("schedule") || t.toLowerCase().includes("availability")) ||
        c.captured.some(cc => cc.topic.toLowerCase().includes("hour") || cc.topic.toLowerCase().includes("timing") || cc.topic.toLowerCase().includes("schedule") || cc.topic.toLowerCase().includes("availability"))
      ),
  },
  {
    id: "location", label: "Physical Location & Contact Info (address, phone number, or website)", group: "identity",
    missing: (c) => !(
      /\b(located|street|address|maple|avenue|suite|city|zip|website|online|digital|remote|kundanahalli|varthur|bengaluru|bangalore|phone|contact)\b/i.test(c.fullUserText) ||
      c.containsAny(['पता', 'गली', 'शहर', 'वेबसाइट', 'ऑनलाइन', 'फोन', 'फ़ोन', 'संपर्क', 'रोड', 'नगर', 'दुकान', 'ऑफिस', 'ऑफ़िस']) ||
      c.resolved.some(t => t.toLowerCase().includes("location") || t.toLowerCase().includes("address") || t.toLowerCase().includes("contact") || t.toLowerCase().includes("website")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("location") || cc.topic.toLowerCase().includes("address") || cc.topic.toLowerCase().includes("contact") || cc.topic.toLowerCase().includes("website"))
    ),
  },
  {
    id: "staff", label: "Staff & Practitioner Roster (names of doctors, specialists, or key departments)", group: "schedule",
    missing: (c) => !(
      /\b(dr\.|doctor|dentist|hygienist|practitioner|specialist|staff|team|counselor|counselors|manager|managers|supervisor|supervisors|representative|agent|advisor|deepika|ananya|department|departments|desk|desks|roster|refer to the team|centralized|no individual|no specific|no name|no names|does not need to mention|refer only to)\b/i.test(c.fullUserText) ||
      (!!c.spec?.extractedEntities?.namedContacts && c.spec.extractedEntities.namedContacts.length > 0) ||
      (!!c.spec?.extractedEntities?.departments && c.spec.extractedEntities.departments.length > 0) ||
      c.resolved.some(t => t.toLowerCase().includes("staff") || t.toLowerCase().includes("team") || t.toLowerCase().includes("roster") || t.toLowerCase().includes("department") || t.toLowerCase().includes("contact") || t.toLowerCase().includes("counselor")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("staff") || cc.topic.toLowerCase().includes("team") || cc.topic.toLowerCase().includes("roster") || cc.topic.toLowerCase().includes("department"))
    ),
  },
  {
    id: "policies", label: "Key Business Policies / Rules (cancellation, fee, or refund details)", group: "policies",
    missing: (c) => {
      const hasCancellation = c.cancelStr === "None — confirmed by business" || (!!c.cancelStr && c.cancelStr !== "Standard cancellation policy applies." && c.cancelStr.trim().length > 5);
      const hasRefunds = c.refundStr === "None — confirmed by business" || (!!c.refundStr && c.refundStr !== "Standard refund policy applies." && c.refundStr.trim().length > 5);
      const hasResolvedPolicy =
        c.resolved.some(t => t.toLowerCase().includes("cancellation") || t.toLowerCase().includes("refund") || t.toLowerCase().includes("policy") || t.toLowerCase().includes("fee")) ||
        c.captured.some(cc => cc.topic.toLowerCase().includes("cancellation") || cc.topic.toLowerCase().includes("refund") || cc.topic.toLowerCase().includes("policy") || cc.topic.toLowerCase().includes("fee")) ||
        /\b(policy|policies|cancellation|refund|fee|fees|discount|scholarship|terms|rules|no policy|does not need to mention|not required|none)\b/i.test(c.fullUserText);
      return !hasCancellation && !hasRefunds && !hasResolvedPolicy;
    },
  },
  {
    id: "intake", label: "Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)", group: "services",
    missing: (c) => !(
      /\b(intake|insurance|ppo|hmo|medicaid|first time|new patient|id card|bring|verify|qualification|qualify|qualifying|class|exam|goal|preparation|pincode|pin code|preference|requirements|screening|question|questions)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("intake") || t.toLowerCase().includes("insurance") || t.toLowerCase().includes("qualification") || t.toLowerCase().includes("screening")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("intake") || cc.topic.toLowerCase().includes("qualification"))
    ),
  },
  {
    id: "infields", label: "Infields & Pre-Call CRM Context Variables (data provided to the agent before the call begins, e.g. caller name, business status, lead info)", group: "services",
    missing: (c) => !(
      /\b(infield|infields|pre-call|pre call|crm variable|crm data|before the call|already know|caller_name|is_business_owner|lead_source|no infield|no infields|zero infield|none required|no pre-call|no pre call)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("infield") || t.toLowerCase().includes("pre-call") || t.toLowerCase().includes("crm")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("infield") || cc.topic.toLowerCase().includes("pre-call") || cc.topic.toLowerCase().includes("crm"))
    ),
  },
  {
    id: "faqs", label: "Common Caller FAQs (frequent questions about pricing, preparation, or services)", group: "services",
    missing: (c) => !(
      (!!c.spec?.knowledgeBase?.faqs && c.spec.knowledgeBase.faqs.length >= 2) ||
      /\b(faq|frequently asked|question|cost|price|pricing|parking|direction|query|queries|answer|answers)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("faq") || t.toLowerCase().includes("question")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("faq"))
    ),
  },
  {
    id: "routing", label: "Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)", group: "policies",
    missing: (c) => !(
      c.resolved.some(t => t.toLowerCase().includes("routing") || t.toLowerCase().includes("transfer") || t.toLowerCase().includes("escalat") || t.toLowerCase().includes("after_hours")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("routing") || cc.topic.toLowerCase().includes("transfer") || cc.topic.toLowerCase().includes("escalat") || cc.topic.toLowerCase().includes("after_hours")) ||
      /\b(route|routing|transfer|transferred|escalate|escalated|escalation|connect with|route to|senior counselor|support team|follow-up|callback|call back|schedule callback)\b/i.test(c.fullUserText)
    ),
  },
  {
    id: "edge_cases", label: "Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)", group: "policies",
    missing: (c) => !(
      c.resolved.some(t => t.toLowerCase().includes("objection") || t.toLowerCase().includes("edge_case") || t.toLowerCase().includes("pushback") || t.toLowerCase().includes("emergency")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("objection") || cc.topic.toLowerCase().includes("edge_case") || cc.topic.toLowerCase().includes("pushback") || cc.topic.toLowerCase().includes("emergency")) ||
      (!!c.spec?.knowledgeBase?.objections && c.spec.knowledgeBase.objections.length >= 1) ||
      /\b(objection|objections|busy|not interested|fees|already enrolled|pushback|concern|concerns|reject|rejection|upset|confused|edge case)\b/i.test(c.fullUserText)
    ),
  },
  {
    id: "call_flow_skeleton", label: "Call Flow Skeleton (greeting, step sequence, branches, or template selection)", group: "callflow",
    missing: (c) => !(
      c.callFlowSteps.length > 0 ||
      /\b(call flow|flow skeleton|step 1|greeting then|template|branching|first step|next step|walk through|standard flow|user defined)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("flow") || t.toLowerCase().includes("skeleton") || t.toLowerCase().includes("template") || t.toLowerCase().includes("steps")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("flow") || cc.topic.toLowerCase().includes("skeleton") || cc.topic.toLowerCase().includes("template") || cc.topic.toLowerCase().includes("steps"))
    ),
  },
  {
    id: "opening_phrase", label: "Opening Line / Greeting Script (exact opening phrasing)", group: "callflow",
    missing: (c) => !(
      !!c.meta.openingPhrase ||
      /\b(say hello|open with|opening phrase|start by saying|greeting script|greet caller with|opening line|start with)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("opening") || t.toLowerCase().includes("greeting") || t.toLowerCase().includes("start")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("opening") || cc.topic.toLowerCase().includes("greeting") || cc.topic.toLowerCase().includes("start"))
    ),
  },
  {
    id: "closing_script", label: "Closing Line / Call Wrap-up Script (exact closing phrasing or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.closingScript ||
      /\b(closing script|wrap up|say goodbye|end the call with|closing phrase|closing line|no special closing|standard goodbye|end with|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("closing") || t.toLowerCase().includes("wrap") || t.toLowerCase().includes("goodbye") || t.toLowerCase().includes("end_call")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("closing") || cc.topic.toLowerCase().includes("wrap") || cc.topic.toLowerCase().includes("goodbye") || cc.topic.toLowerCase().includes("end_call"))
    ),
  },
  {
    id: "silence", label: "No-Input / Silence Handling (timeout seconds, reprompt action, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.silenceHandling ||
      /\b(silence|no input|no-input|doesn't answer|quiet|timeout|reprompt|re-prompt|if caller says nothing|say nothing|when silent|no response|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("silence") || t.toLowerCase().includes("timeout") || t.toLowerCase().includes("no_input") || t.toLowerCase().includes("no-input") || t.toLowerCase().includes("reprompt")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("silence") || cc.topic.toLowerCase().includes("timeout") || cc.topic.toLowerCase().includes("no_input") || cc.topic.toLowerCase().includes("no-input") || cc.topic.toLowerCase().includes("reprompt"))
    ),
  },
  {
    id: "interruption", label: "Interruption / Barge-in Behavior (allow interruption vs disallow, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.interruptionPolicy ||
      /\b(barge in|barge-in|interrupt|interruption|talk over|cut off|allow interruption|do not interrupt|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("interrupt") || t.toLowerCase().includes("barge")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("interrupt") || cc.topic.toLowerCase().includes("barge"))
    ),
  },
  {
    id: "digression", label: "Mid-Flow Digression Handling (answer off-script question then resume vs refuse, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.digressionPolicy ||
      /\b(digress|digression|off topic|off-topic|off script|off-script|mid flow|mid-flow|tangent|answer and return|return to script|resume where left off|steer back|redirect|avoid going outside|guide the conversation back|keep the conversation focused|bring the user back|sidetrack|sidetracked|unrelated|focus|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("digress") || t.toLowerCase().includes("tangent") || t.toLowerCase().includes("off_script") || t.toLowerCase().includes("off-script") || t.toLowerCase().includes("unrelated") || t.toLowerCase().includes("sidetrack") || t.toLowerCase().includes("focus")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("digress") || cc.topic.toLowerCase().includes("tangent") || cc.topic.toLowerCase().includes("off_script") || cc.topic.toLowerCase().includes("off-script") || cc.topic.toLowerCase().includes("unrelated") || cc.topic.toLowerCase().includes("sidetrack") || cc.topic.toLowerCase().includes("focus"))
    ),
  },
  {
    id: "retry_exhaustion", label: "Retry Exhaustion Fallback (action after max retries per slot e.g. transfer/hangup)", group: "callflow",
    missing: (c) => !(
      c.callFlowSteps.some((s: any) => s?.onFailure?.action || s?.onFailure?.target) ||
      /\b(after 3 retries|max retries|retry limit|three failures|failed attempts|if caller can't provide|give up and transfer|retry exhaustion|fallback|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("retry") || t.toLowerCase().includes("exhaustion") || t.toLowerCase().includes("fallback")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("retry") || cc.topic.toLowerCase().includes("exhaustion") || cc.topic.toLowerCase().includes("fallback"))
    ),
  },
  {
    id: "confirmation_style", label: "Confirmation & Read-back Style (character-by-character vs summary, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.confirmationStyle ||
      /\b(read back|confirm back|character by character|digit by digit|repeat back|confirm phone number|confirmation style|no readback|readback|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("confirmation") || t.toLowerCase().includes("readback") || t.toLowerCase().includes("confirm")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("confirmation") || cc.topic.toLowerCase().includes("readback") || cc.topic.toLowerCase().includes("confirm"))
    ),
  },
  {
    id: "voice_persona", label: "Voice & Persona Characteristics (pacing, formality, accent, or N/A)", group: "policies",
    missing: (c) => !(
      !!c.meta.voiceCharacteristics ||
      /\b(pacing|fast|slow|formality|formal|casual|filler words|um|uh|accent|british|american|indian accent|voice style|voice persona|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("voice") || t.toLowerCase().includes("persona") || t.toLowerCase().includes("pacing") || t.toLowerCase().includes("accent") || t.toLowerCase().includes("tone")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("voice") || cc.topic.toLowerCase().includes("persona") || cc.topic.toLowerCase().includes("pacing") || cc.topic.toLowerCase().includes("accent") || cc.topic.toLowerCase().includes("tone"))
    ),
  },
  {
    id: "disclosures", label: "Consent & Compliance Disclosures (recording consent, AI identity disclosure, or N/A)", group: "policies",
    missing: (c) => !(
      (!!c.snap.policies?.disclosures && c.snap.policies.disclosures.length > 0) ||
      (!!c.spec?.guardrails?.disclosures && c.spec.guardrails.disclosures.length > 0) ||
      /\b(disclosure|disclose|recorded call|recording consent|ai disclosure|state that you are ai|compliance notice|no disclosure|not regulated|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("disclosure") || t.toLowerCase().includes("consent") || t.toLowerCase().includes("compliance") || t.toLowerCase().includes("recording")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("disclosure") || cc.topic.toLowerCase().includes("consent") || cc.topic.toLowerCase().includes("compliance") || cc.topic.toLowerCase().includes("recording"))
    ),
  },
  {
    id: "dtmf", label: "DTMF / Keypad Input Fallback (keypad entry fallback after speech recognition failure, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.dtmfFallback ||
      /\b(dtmf|keypad|press 1|type digits|keypad entry|touch tone|if speech fails use keypad|no dtmf|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("dtmf") || t.toLowerCase().includes("keypad") || t.toLowerCase().includes("touch_tone")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("dtmf") || cc.topic.toLowerCase().includes("keypad") || cc.topic.toLowerCase().includes("touch_tone"))
    ),
  },
  {
    id: "holiday_hours", label: "Holiday / Exception Hours (special closures, holiday schedules, or N/A)", group: "schedule",
    missing: (c) => !(
      (typeof c.snap.operatingHours === 'object' && !!c.snap.operatingHours?.exceptions && c.snap.operatingHours.exceptions.length > 0) ||
      (!!c.snap.exceptions && c.snap.exceptions.length > 0) ||
      /\b(holiday|holidays|exceptions|closed on|christmas|new year|national holiday|no special holiday hours|standard only|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("holiday") || t.toLowerCase().includes("exception")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("holiday") || cc.topic.toLowerCase().includes("exception"))
    ),
  },
  {
    id: "entry_routing", label: "Entry Routing & Multi-Request Branching (how distinct request types branch from opening, or single flow N/A)", group: "callflow",
    missing: (c) => !(
      (!!c.spec?.callFlowPlan?.entryRouting && c.spec.callFlowPlan.entryRouting.length > 0) ||
      /\b(entry routing|multiple request types|if caller says cancel|if caller says book|branching from start|single request type only|one flow only|single, straightforward|single straightforward|straightforward welcome flow|standard onboarding flow first|smart branching|branch into specific handling flows|branching into different paths|branching right away|single flow|standard onboarding journey|branching \/ exception|branch|branching|handling flows|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("entry") || t.toLowerCase().includes("routing") || t.toLowerCase().includes("multi-request") || t.toLowerCase().includes("multi_request") || t.toLowerCase().includes("branch") || t.toLowerCase().includes("flow")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("entry") || cc.topic.toLowerCase().includes("routing") || cc.topic.toLowerCase().includes("multi-request") || cc.topic.toLowerCase().includes("multi_request") || cc.topic.toLowerCase().includes("branch") || cc.topic.toLowerCase().includes("flow"))
    ),
  },
  {
    id: "injection", label: "Prompt Injection & Override Resistance (behavior when caller attempts to override rules/role, or default applied)", group: "policies",
    missing: (c) => !(
      !!c.spec?.guardrails?.injectionResistance ||
      /\b(injection|jailbreak|override|ignore instructions|reveal prompt|bypass rules|security prompt|default guardrails|n\/a)\b/i.test(c.fullUserText) ||
      c.resolved.some(t => t.toLowerCase().includes("injection") || t.toLowerCase().includes("jailbreak") || t.toLowerCase().includes("resistance") || t.toLowerCase().includes("override")) ||
      c.captured.some(cc => cc.topic.toLowerCase().includes("injection") || cc.topic.toLowerCase().includes("jailbreak") || cc.topic.toLowerCase().includes("resistance") || cc.topic.toLowerCase().includes("override"))
    ),
  },
];

function toStr(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val === null || val === undefined) return "";
  if (typeof val === 'object') {
    try { return JSON.stringify(val); } catch { return ""; }
  }
  return String(val);
}

function buildContext(
  spec: Partial<BusinessSpecification>,
  chatHistory: Array<{ role: string; content: string }>,
): CoverageContext {
  const meta = spec.meta || {} as Partial<BusinessSpecification['meta']>;
  const snap = spec.businessSnapshot || {} as Partial<BusinessSpecification['businessSnapshot']>;
  const fullUserText = chatHistory
    .filter(m => m.role.toLowerCase() === "user")
    .map(m => m.content)
    .join(" ");
  return {
    spec,
    meta,
    snap,
    resolved: spec?.resolvedTopics || [],
    captured: spec?.capturedTopics || [],
    fullUserText,
    // Language-aware detection: Hindi/Hinglish callers answer in Devanagari, which
    // the English keyword regexes would miss (JS \b word boundaries are ASCII-only).
    containsAny: (words: string[]) => words.some(w => w && fullUserText.includes(w)),
    companyStr: toStr(meta.companyName),
    goalStr: toStr(meta.primaryGoal),
    hoursStr: toStr(snap.operatingHours),
    cancelStr: toStr(snap.policies?.cancellation),
    refundStr: toStr(snap.policies?.refunds),
    callFlowSteps: spec?.callFlowPlan?.userDefinedSteps || spec?.callFlowPlan?.steps || [],
  };
}

export class CoverageArchitect {
  public static evaluate(
    spec: Partial<BusinessSpecification>,
    chatHistory: Array<{ role: string; content: string }> = []
  ): CoverageReport {
    const ctx = buildContext(spec, chatHistory);
    const missingFields = COVERAGE_RULES.filter(rule => rule.missing(ctx)).map(rule => rule.label);

    const userTurnCount = chatHistory.filter(m => m.role.toLowerCase() === "user").length;
    if (missingFields.length > 0 && userTurnCount < 5) {
      if (!missingFields.includes(INTERVIEW_IN_PROGRESS)) {
        missingFields.push(INTERVIEW_IN_PROGRESS);
      }
    }

    return {
      missingFields,
      isReadyForCompilation: missingFields.length === 0,
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

    // Group the still-missing fields by their coverage-rule topic group. Order is
    // preserved because COVERAGE_RULES and missingFields share the same ordering.
    const inGroup = (g: TopicGroup): string[] =>
      COVERAGE_RULES.filter(r => r.group === g && missingFields.includes(r.label)).map(r => r.label);
    const topic1Fields = inGroup("identity");
    const topic2Fields = inGroup("schedule");
    const topic3Fields = inGroup("services");
    const topic4Fields = inGroup("policies");
    const topicCallFlowFields = inGroup("callflow");

    let activeTopicGroup = "Call Flow Design & Conversational Mechanics";
    let targetFields = topicCallFlowFields.length > 0 ? topicCallFlowFields : missingFields;
    let topicInstruction = `We are designing the conversational call flow and dialogue mechanics for ${vertical}. Specifically, ask a guided question targeting: ${targetFields[0]}. If asking about Call Flow Skeleton, offer them a standard industry 5-step template vs building from scratch. If asking about Interruption/Digression or Silence Handling, ask directly what the agent should do when interrupted, off-script, or met with silence.`;

    if (missingFields.includes(LANGUAGE_FIELD_LABEL)) {
      activeTopicGroup = "Identity, Language & Location";
      targetFields = [LANGUAGE_FIELD_LABEL];
      topicInstruction = `We must first establish the exact language and dialect the voice agent will speak on calls (e.g., English, Hindi, Hinglish, or Multilingual auto-detection). Formulate a warm, conversational question asking which language or dialect they prefer.`;
    } else if (topic1Fields.length > 0) {
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
      let text = response.text?.trim();
      if (!text) {
        throw new Error("LLM returned an empty question response.");
      }
      text = text.replace(/^(?:Since we have (?:already )?(?:confirmed|established|covered|completed|finalized).*?we are ready to (?:officially )?(?:transition|move)(?: on)? (?:in)?to .*?[\.\?\!]\s*)/i, "");
      text = text.replace(/\b(?:Phase|Stage)\s*\d+(?:\s*\([^)]+\))?:?\s*/gi, "");
      return text.trim();
    } catch (error) {
      throw new Error(`LLM Generation Error: Failed to dynamically generate interview question (${error instanceof Error ? error.message : String(error)}). Preloaded fallback questions are disabled.`);
    }
  }
}
