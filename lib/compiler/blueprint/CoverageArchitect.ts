import { BusinessSpecification, safeParseJson } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { logger } from "@/lib/logger";

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

/**
 * Coverage rules that are asked of EVERY agent regardless of use case. These are the
 * safety/compliance/identity floor: getting them wrong is harmful in any domain, so
 * the adaptive-topic filter is never allowed to skip them.
 */
const ALWAYS_ASK = new Set<string>([
  'company_name', 'primary_goal', 'language', 'services', 'policies', 'disclosures', 'injection',
]);

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
  /**
   * True when any resolved topic tag has a token starting with one of `needles`.
   *
   * Token-prefix, never substring: plain `.includes("flow")` matched the tag
   * `cross_sell_workflow`, which marked "Call Flow Skeleton" answered and meant the
   * user was never asked to describe their call stages at all. Prefix matching is
   * kept so "escalat" still matches "escalation".
   */
  resolvedHas: (...needles: string[]) => boolean;
  /** Same token-prefix matching, over capturedTopics tags. */
  capturedHas: (...needles: string[]) => boolean;
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
      !/\b(called|named|clinic is|dentistry|company|business is)\s+([A-Z][a-zA-Z\s]+)/i.test(c.fullUserText) &&
      !c.resolvedHas("company", "business", "name") &&
      !c.capturedHas("company", "business", "name"),
  },
  {
    id: "primary_goal", label: "Primary Agent Goal / Use Case", group: "identity",
    missing: (c) => 
      (!c.goalStr || c.goalStr === "Assist callers effectively" || c.goalStr.trim().length < 15) &&
      !c.resolvedHas("goal", "purpose", "objective", "use_case") &&
      !c.capturedHas("goal", "purpose", "objective", "use_case"),
  },
  {
    id: "language", label: LANGUAGE_FIELD_LABEL, group: "identity",
    missing: (c) => !(
      /\b(english|hindi|hinglish|bilingual|multilingual|devanagari|language|dialect|speak in|talk in|voice language|kannada|tamil|telugu|marathi|gujarati|bengali|punjabi|malayalam|urdu)\b/i.test(c.fullUserText) ||
      c.resolvedHas("language", "dialect") ||
      c.capturedHas("language", "dialect")
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
        c.resolvedHas("service", "offering", "course", "product", "module") ||
        c.capturedHas("service", "offering", "course", "product", "module")
      ),
  },

  {
    id: "location", label: "Physical Location & Contact Info (address, phone number, or website)", group: "identity",
    missing: (c) => !(
      /\b(located|street|address|maple|avenue|suite|city|zip|website|online|digital|remote|kundanahalli|varthur|bengaluru|bangalore|phone|contact)\b/i.test(c.fullUserText) ||
      c.containsAny(['पता', 'गली', 'शहर', 'वेबसाइट', 'ऑनलाइन', 'फोन', 'फ़ोन', 'संपर्क', 'रोड', 'नगर', 'दुकान', 'ऑफिस', 'ऑफ़िस']) ||
      c.resolvedHas("location", "address", "contact", "website") ||
      c.capturedHas("location", "address", "contact", "website")
    ),
  },
  {
    id: "staff", label: "Staff & Practitioner Roster (names of doctors, specialists, or key departments)", group: "schedule",
    missing: (c) => !(
      /\b(dr\.|doctor|dentist|hygienist|practitioner|specialist|staff|team|counselor|counselors|manager|managers|supervisor|supervisors|representative|agent|advisor|deepika|ananya|department|departments|desk|desks|roster|refer to the team|centralized|no individual|no specific|no name|no names|any name|any names|does not need to mention|refer only to|no roster|no staff|no doctors|no therapists|no lead therapists|no coordinators|no details like these|no team structure|only booking|no transfer|no transfers|none needed|not needed)\b/i.test(c.fullUserText) ||
      (!!c.spec?.extractedEntities?.namedContacts && c.spec.extractedEntities.namedContacts.length > 0) ||
      (!!c.spec?.extractedEntities?.departments && c.spec.extractedEntities.departments.length > 0) ||
      c.resolvedHas("staff", "team", "roster", "department", "contact", "counselor") ||
      c.capturedHas("staff", "team", "roster", "department")
    ),
  },
  {
    id: "policies", label: "Key Business Policies / Rules (cancellation, fee, or refund details)", group: "policies",
    missing: (c) => {
      const hasCancellation = c.cancelStr === "None — confirmed by business" || (!!c.cancelStr && c.cancelStr !== "Standard cancellation policy applies." && c.cancelStr.trim().length > 5);
      const hasRefunds = c.refundStr === "None — confirmed by business" || (!!c.refundStr && c.refundStr !== "Standard refund policy applies." && c.refundStr.trim().length > 5);
      const hasResolvedPolicy =
        c.resolvedHas("cancellation", "refund", "policy", "fee") ||
        c.capturedHas("cancellation", "refund", "policy", "fee") ||
        /\b(policy|policies|cancellation|refund|fee|fees|discount|scholarship|terms|rules|no policy|does not need to mention|not required|none|no payment|booking fees|payment terms)\b/i.test(c.fullUserText);
      return !hasCancellation && !hasRefunds && !hasResolvedPolicy;
    },
  },
  {
    id: "intake", label: "Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)", group: "services",
    missing: (c) => !(
      /\b(intake|insurance|ppo|hmo|medicaid|first time|new patient|id card|bring|verify|qualification|qualify|qualifying|class|exam|goal|preparation|pincode|pin code|preference|requirements|screening|question|questions)\b/i.test(c.fullUserText) ||
      c.resolvedHas("intake", "insurance", "qualification", "screening") ||
      c.capturedHas("intake", "qualification")
    ),
  },
  {
    id: "infields", label: "What the system already knows about the caller before the call", group: "services",
    missing: (c) => !(
      (!!c.spec?.dynamicVariables && c.spec.dynamicVariables.length > 0) ||
      /\b(infield|infields|pre-call|pre call|crm variable|crm data|before the call|already know|caller_name|is_business_owner|lead_source|no infield|no infields|zero infield|none required|no pre-call|no pre call|only company name|just company name|only company|just company|no just|only variable|no other variable|no other variables|just variable|any variable|pass along|we will pass|system will pass|out of scope|not required|no CRM|no variables|only pass|just pass)\b/i.test(c.fullUserText) ||
      c.resolvedHas("infield", "pre-call", "pre_call", "crm", "variable", "dynamic") ||
      c.capturedHas("infield", "pre-call", "pre_call", "crm", "variable", "dynamic") ||
      /* Strictly check for "only X" or "just Y" bounding phrases using proximity regex rather than arbitrary .includes() to avoid false positives */
      /\b(only|just)\s+(the\s+)?(name|variable|data|company|pass|field|infield)s?\b/i.test(c.fullUserText) ||
      /\b(no just|only just|nothing else|no other|that's all|only [a-z0-9_]+|just [a-z0-9_]+)\b/i.test(c.fullUserText)
    ),
  },
  {
    id: "faqs", label: "Common Caller FAQs (frequent questions about pricing, preparation, or services)", group: "services",
    missing: (c) => !(
      (!!c.spec?.knowledgeBase?.faqs && c.spec.knowledgeBase.faqs.length >= 2) ||
      /\b(faq|frequently asked|question|cost|price|pricing|parking|direction|query|queries|answer|answers)\b/i.test(c.fullUserText) ||
      c.resolvedHas("faq", "question") ||
      c.capturedHas("faq")
    ),
  },
  {
    id: "routing", label: "Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)", group: "policies",
    missing: (c) => !(
      c.resolvedHas("routing", "transfer", "escalat", "after_hours") ||
      c.capturedHas("routing", "transfer", "escalat", "after_hours") ||
      /\b(route|routing|transfer|transferred|escalate|escalated|escalation|connect with|route to|senior counselor|support team|follow-up|callback|call back|schedule callback|no transfers|does not perform any transfers|doesn't perform any transfers)\b/i.test(c.fullUserText)
    ),
  },
  {
    id: "edge_cases", label: "Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)", group: "policies",
    missing: (c) => !(
      c.resolvedHas("objection", "edge_case", "pushback", "emergency") ||
      c.capturedHas("objection", "edge_case", "pushback", "emergency") ||
      (!!c.spec?.knowledgeBase?.objections && c.spec.knowledgeBase.objections.length >= 1) ||
      /\b(objection|objections|busy|not interested|fees|already enrolled|pushback|concern|concerns|reject|rejection|upset|confused|edge case)\b/i.test(c.fullUserText)
    ),
  },

  {
    id: "opening_phrase", label: "Opening line / greeting", group: "callflow",
    missing: (c) => !(
      !!c.meta.openingPhrase ||
      /\b(say hello|open with|opening phrase|start by saying|greeting script|greet caller with|opening line|start with)\b/i.test(c.fullUserText) ||
      c.resolvedHas("opening", "greeting", "start") ||
      c.capturedHas("opening", "greeting", "start")
    ),
  },
  {
    id: "closing_script", label: "How the call should wrap up", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.closingScript ||
      /\b(closing script|wrap up|say goodbye|end the call with|closing phrase|closing line|no special closing|standard goodbye|end with|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("closing", "wrap", "goodbye", "end_call") ||
      c.capturedHas("closing", "wrap", "goodbye", "end_call")
    ),
  },

  {
    id: "interruption", label: "Interruption / Barge-in Behavior (allow interruption vs disallow, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.interruptionPolicy ||
      /\b(barge in|barge-in|interrupt|interruption|talk over|cut off|allow interruption|do not interrupt|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("interrupt", "barge") ||
      c.capturedHas("interrupt", "barge")
    ),
  },
  {
    id: "digression", label: "Mid-Flow Digression Handling (answer off-script question then resume vs refuse, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.digressionPolicy ||
      /\b(digress|digression|off topic|off-topic|off script|off-script|mid flow|mid-flow|tangent|answer and return|return to script|resume where left off|steer back|redirect|avoid going outside|guide the conversation back|keep the conversation focused|bring the user back|sidetrack|sidetracked|unrelated|focus|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("digress", "tangent", "off_script", "off-script", "unrelated", "sidetrack", "focus") ||
      c.capturedHas("digress", "tangent", "off_script", "off-script", "unrelated", "sidetrack", "focus")
    ),
  },
  {
    id: "retry_exhaustion", label: "Retry Exhaustion Fallback (action after max retries per slot e.g. transfer/hangup)", group: "callflow",
    missing: (c) => !(
      c.callFlowSteps.some((s: any) => s?.onFailure?.action || s?.onFailure?.target) ||
      /\b(after 3 retries|max retries|retry limit|three failures|failed attempts|if caller can't provide|give up and transfer|retry exhaustion|fallback|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("retry", "exhaustion", "fallback") ||
      c.capturedHas("retry", "exhaustion", "fallback")
    ),
  },
  {
    id: "confirmation_style", label: "Confirmation & Read-back Style (character-by-character vs summary, or N/A)", group: "callflow",
    missing: (c) => !(
      !!c.spec?.callFlowPlan?.confirmationStyle ||
      /\b(read back|confirm back|character by character|digit by digit|repeat back|confirm phone number|confirmation style|no readback|readback|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("confirmation", "readback", "confirm") ||
      c.capturedHas("confirmation", "readback", "confirm")
    ),
  },
  {
    id: "voice_persona", label: "Voice & Persona Characteristics (pacing, formality, accent, or N/A)", group: "policies",
    missing: (c) => !(
      !!c.meta.voiceCharacteristics ||
      /\b(pacing|fast|slow|formality|formal|casual|filler words|um|uh|accent|british|american|indian accent|voice style|voice persona|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("voice", "persona", "pacing", "accent", "tone") ||
      c.capturedHas("voice", "persona", "pacing", "accent", "tone")
    ),
  },
  {
    id: "disclosures", label: "Consent & Compliance Disclosures (recording consent, AI identity disclosure, or N/A)", group: "policies",
    missing: (c) => !(
      (!!c.snap.policies?.disclosures && c.snap.policies.disclosures.length > 0) ||
      (!!c.spec?.guardrails?.disclosures && c.spec.guardrails.disclosures.length > 0) ||
      /\b(disclosure|disclose|recorded call|recording consent|ai disclosure|state that you are ai|compliance notice|no disclosure|not regulated|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("disclosure", "consent", "compliance", "recording") ||
      c.capturedHas("disclosure", "consent", "compliance", "recording")
    ),
  },

  {
    id: "entry_routing", label: "Entry Routing & Multi-Request Branching (how distinct request types branch from opening, or single flow N/A)", group: "callflow",
    missing: (c) => !(
      (!!c.spec?.callFlowPlan?.entryRouting && c.spec.callFlowPlan.entryRouting.length > 0) ||
      /\b(entry routing|multiple request types|if caller says cancel|if caller says book|branching from start|single request type only|one flow only|single, straightforward|single straightforward|straightforward welcome flow|standard onboarding flow first|smart branching|branch into specific handling flows|branching into different paths|branching right away|single flow|standard onboarding journey|branching \/ exception|branch|branching|handling flows|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("entry", "routing", "multi-request", "multi_request", "branch", "flow") ||
      c.capturedHas("entry", "routing", "multi-request", "multi_request", "branch", "flow")
    ),
  },
  {
    id: "call_flow_skeleton", label: "Call Flow FSM Logic (states, extractions, conditional routing)", group: "callflow",
    missing: (c) => !(
      c.callFlowSteps.length > 0 ||
      /\b(call flow|flow skeleton|step 1|greeting then|template|branching|first step|next step|walk through|standard flow|user defined)\b/i.test(c.fullUserText) ||
      c.resolvedHas("flow", "skeleton", "template", "steps") ||
      c.capturedHas("flow", "skeleton", "template", "steps")
    ),
  },
  {
    id: "injection", label: "Prompt Injection & Override Resistance (behavior when caller attempts to override rules/role, or default applied)", group: "policies",
    missing: (c) => !(
      !!c.spec?.guardrails?.injectionResistance ||
      /\b(injection|jailbreak|override|ignore instructions|reveal prompt|bypass rules|security prompt|default guardrails|n\/a)\b/i.test(c.fullUserText) ||
      c.resolvedHas("injection", "jailbreak", "resistance", "override") ||
      c.capturedHas("injection", "jailbreak", "resistance", "override")
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

/** Splits a snake_case/kebab tag into its word tokens. */
function tagTokens(tag: string): string[] {
  return String(tag || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** A tag matches when one of its TOKENS starts with the needle (not mere substring). */
function tagsMatch(tags: string[], needles: string[]): boolean {
  return tags.some(tag => {
    const tokens = tagTokens(tag);
    return needles.some(n => {
      const needle = n.toLowerCase();
      return tokens.some(tok => tok.startsWith(needle));
    });
  });
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
  const resolved = spec?.resolvedTopics || [];
  const captured = spec?.capturedTopics || [];
  return {
    spec,
    meta,
    snap,
    resolved,
    captured,
    resolvedHas: (...needles: string[]) => tagsMatch(resolved, needles),
    capturedHas: (...needles: string[]) => tagsMatch(captured.map(c => c?.topic || ''), needles),
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
    // Adaptive topics: skip anything the interview established is irrelevant to this
    // agent, but never the mandatory floor. Stays deterministic (and a no-op when
    // notApplicableTopics is unset) so evaluate() remains sync and cheap.
    const notApplicable = new Set(spec?.meta?.notApplicableTopics || []);
    const applicable = notApplicable.size === 0
      ? COVERAGE_RULES
      : COVERAGE_RULES.filter(rule => ALWAYS_ASK.has(rule.id) || !notApplicable.has(rule.id));
    const missingFields = applicable.filter(rule => rule.missing(ctx)).map(rule => rule.label);

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

  /**
   * Verifies that topics the deterministic rules believe are answered are ACTUALLY
   * answered, returning the labels that are not.
   *
   * The rules decide *what to ask*; they are a poor judge of *whether the transcript
   * answered it*, because they match keywords. "Our staff speak English" satisfies the
   * language regex without anyone saying what language the AGENT should use. Rather
   * than run an LLM per field per turn, this runs once — at the moment the interview
   * believes it is done — which is the only point where a false "covered" does damage.
   *
   * Fails open: if the LLM is unavailable or returns nonsense, the deterministic
   * verdict stands.
   */
  public static async adjudicateCoverage(
    _spec: Partial<BusinessSpecification>,
    chatHistory: Array<{ role: string; content: string }>,
    missingFields: string[],
  ): Promise<string[]> {
    const covered = COVERAGE_RULES.filter(r => !missingFields.includes(r.label));
    if (covered.length === 0 || chatHistory.length === 0) return [];

    const historyText = chatHistory
      .filter(m => m.role.toLowerCase() === 'user')
      .map(m => `USER: ${m.content}`)
      .join('\n');

    const prompt = `You are auditing a completed discovery interview for a voice AI agent.
Below is everything the user said, then a checklist of topics we believe they answered.

Return the ids of any topic that the user did NOT actually answer. A topic counts as
answered if the user gave a real decision about it — including explicitly saying it is
not needed, or "N/A". A topic is NOT answered if the transcript merely mentions a
related word without stating a decision.

Be conservative: only list a topic when you are confident it was never addressed.

USER TRANSCRIPT:
${historyText}

TOPICS BELIEVED ANSWERED:
${covered.map(r => `- ${r.id}: ${r.label}`).join('\n')}

Return ONLY valid JSON: { "unanswered": ["topic_id", ...] }`;

    try {
      const res = await geminiClient.generate({
        systemInstruction: 'You are a strict interview auditor. Return ONLY valid JSON.',
        prompt,
        responseMimeType: 'application/json',
      });
      const parsed = safeParseJson<{ unanswered?: unknown }>(res.text, { unanswered: [] });
      const ids = Array.isArray(parsed?.unanswered) ? parsed.unanswered.map(String) : [];
      if (ids.length === 0) return [];
      const byId = new Map(COVERAGE_RULES.map(r => [r.id, r.label]));
      return ids.map(id => byId.get(id)).filter((l): l is string => !!l);
    } catch (err) {
      logger.warn('CoverageArchitect.adjudicateCoverage failed; keeping deterministic verdict', err);
      return [];
    }
  }

  /**
   * Decides which coverage topics are irrelevant to THIS agent, so the interview stops
   * asking a fixed checklist of every use case (e.g. keypad fallback for a voice-only
   * line, holiday hours for an outbound campaign).
   *
   * Returns rule ids to skip. The ALWAYS_ASK floor is stripped out here rather than
   * trusted to the model, so no prompt wording can talk the interview out of asking
   * about language, safety, or disclosure. Fails open to "everything is relevant".
   */
  public static async selectNotApplicableTopics(
    spec: Partial<BusinessSpecification>,
    chatHistory: Array<{ role: string; content: string }>,
  ): Promise<string[]> {
    const candidates = COVERAGE_RULES.filter(r => !ALWAYS_ASK.has(r.id));
    const historyText = chatHistory
      .filter(m => m.role.toLowerCase() === 'user')
      .map(m => `USER: ${m.content}`)
      .join('\n');
    if (!historyText.trim()) return [];

    const prompt = `You are planning a discovery interview for a voice AI agent.
Based on what the user has described, decide which checklist topics are genuinely NOT
APPLICABLE to this specific agent, so we do not waste the user's time asking.

Agent context:
- Company: ${spec?.meta?.companyName || 'unknown'}
- Goal: ${spec?.meta?.primaryGoal || 'unknown'}
- Call direction: ${spec?.meta?.callDirection || 'unknown'}

USER TRANSCRIPT:
${historyText}

CANDIDATE TOPICS:
${candidates.map(r => `- ${r.id}: ${r.label}`).join('\n')}

Only mark a topic not-applicable when it clearly cannot apply to this agent (for
example, keypad fallback for an agent that never collects digits). When in doubt,
leave it applicable — asking a needless question is far cheaper than missing a
requirement.

Return ONLY valid JSON: { "notApplicable": ["topic_id", ...] }`;

    try {
      const res = await geminiClient.generate({
        systemInstruction: 'You are an interview planner. Return ONLY valid JSON.',
        prompt,
        responseMimeType: 'application/json',
      });
      const parsed = safeParseJson<{ notApplicable?: unknown }>(res.text, { notApplicable: [] });
      const ids = Array.isArray(parsed?.notApplicable) ? parsed.notApplicable.map(String) : [];
      const valid = new Set(candidates.map(r => r.id));
      return ids.filter(id => valid.has(id) && !ALWAYS_ASK.has(id));
    } catch (err) {
      logger.warn('CoverageArchitect.selectNotApplicableTopics failed; treating all topics as applicable', err);
      return [];
    }
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
    let topicInstruction = `We are designing the Finite State Machine (FSM) call flow logic and conversational mechanics for ${vertical}. Specifically, ask a guided question targeting: ${targetFields[0]}. If asking about Call Flow FSM Logic, ask the user to outline their step-by-step call flow or state machine. Tell them they can provide their own detailed sequence (like Step 1, Step 2, branching, etc.), or if they prefer, you can propose a standard one based on their industry. Do NOT ask them to write the exact sentences or dialogue the bot should speak, as our system synthesizes that automatically from the state machine rules. If asking about Interruption or Digression Handling, ask directly what the agent should do when interrupted or off-script.`;

    if (missingFields.includes(LANGUAGE_FIELD_LABEL)) {
      activeTopicGroup = "Identity, Language & Location";
      targetFields = [LANGUAGE_FIELD_LABEL];
      topicInstruction = `We must first establish the exact language and dialect the voice agent will speak on calls (e.g., English, Hindi, Hinglish, or Multilingual auto-detection). Formulate a warm, conversational question asking which language or dialect they prefer.`;
    } else if (topic1Fields.length > 0) {
      activeTopicGroup = "Identity, Language & Location";
      targetFields = topic1Fields;
      topicInstruction = `Ask a guided, conversational question to find out the following missing information: ${targetFields[0]}. Focus ONLY on this specific detail and do not ask about anything else.`;
    } else if (topic2Fields.length > 0) {
      activeTopicGroup = "Schedule & Team Setup";
      targetFields = topic2Fields;
      topicInstruction = `We are exploring the schedule and team setup: exact operating days/hours, holiday/exception hours, or staff/practitioner roster (names of doctors, specialists, or departments). Do NOT ask about call flow or policies yet. Formulate an engaging question targeting: ${topic2Fields[0]}.`;
    } else if (topic3Fields.length > 0) {
      activeTopicGroup = "Services, Caller Intake & Pre-Call Variables";
      targetFields = topic3Fields;
      topicInstruction = `We are exploring core offerings, caller intake requirements, FAQs, or what the system already knows about the caller before the call (such as caller_name, business status, or lead source). If targeting variables, ask specifically: "Are there any variables our system already knows before the call starts (like their name or segment)?" Do NOT jump into cancellation fees or call flow yet. Formulate a natural question targeting: ${topic3Fields[0]}.`;
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
        systemInstruction: "You are an expert conversational AI architect building a Voice AI agent through an interactive interview. CRITICAL BEHAVIORAL RULE: NEVER mention 'Phase 1', 'Phase 2', 'Discovery Stage', 'transition', or any internal phase/stage numbers or names to the user. Never recite summaries of completed steps just to announce moving forward. Simply ask the next logical question in a warm, direct, conversational manner. Never ask the user about tools, function calls, APIs, or how backend/CRM data is fetched — assume infields exist and telephony tools are added automatically.",
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
