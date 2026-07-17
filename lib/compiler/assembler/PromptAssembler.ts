import { BusinessSpecification } from "@/lib/llm/types";
import { resolveSlotDigitSpec } from "@/lib/compiler/constants/slotRegistry";
import { buildToolInvocation, type ToolArgValue } from "@/lib/compiler/constants/toolRegistry";
import { resolveLanguagePolicy } from "@/lib/llm/language/LanguagePolicy";
import { logger } from "@/lib/logger";

function formatOperatingHours(hours: any): string {
  if (!hours) return "Standard Business Hours";
  if (typeof hours === "string") return hours;
  if (typeof hours === "object") {
    return Object.entries(hours).map(([day, range]) => `${day}: ${range}`).join('; ');
  }
  return String(hours);
}

function formatPolicyString(val: any, defaultVal: string): string {
  if (!val) return defaultVal;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.join("; ");
  if (typeof val === "object") {
    return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
  }
  return String(val);
}

/**
 * Region-specific reference data. This is irreducibly a lookup — no rule derives
 * "Qatar -> 999". Correctness therefore does NOT depend on the table being
 * complete: an unlisted region falls back to generic guidance rather than
 * inheriting another country's numbers. Add rows to improve specificity only.
 */
const EMERGENCY_BY_REGION: Record<string, string> = {
  IN: 'call 112 for immediate physical danger/emergency services in India, or the KIRAN Mental Health Helpline (1800-599-0019) for psychological distress',
  US: 'call 911 for immediate danger, or the 988 Suicide & Crisis Lifeline for suicide/crisis situations',
  QA: 'call 999 for emergency services in Qatar',
  AE: 'call 999 for police or 998 for ambulance in the UAE',
  GB: 'call 999 for emergency services',
  SA: 'call 997 for ambulance or 999 for police in Saudi Arabia',
};

const CURRENCY_BY_REGION: Record<string, { code: string; symbol: string; name: string }> = {
  IN: { code: 'INR', symbol: '₹', name: 'Indian Rupees' },
  US: { code: 'USD', symbol: '$', name: 'US Dollars' },
  CA: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollars' },
  GB: { code: 'GBP', symbol: '£', name: 'British Pounds' },
  QA: { code: 'QAR', symbol: 'QR', name: 'Qatari Riyals' },
  AE: { code: 'AED', symbol: 'AED', name: 'UAE Dirhams' },
  SA: { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyals' },
  SG: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollars' },
  AU: { code: 'AUD', symbol: 'A$', name: 'Australian Dollars' },
};

/** Explicit signals only — never guessed from company name or free text. */
export function resolveRegion(spec?: Partial<BusinessSpecification>, draft?: any): string | undefined {
  const meta = spec?.meta as { region?: string } | undefined;
  if (meta?.region) return String(meta.region).trim().toUpperCase().slice(0, 2);
  const draftVars: unknown[] = Array.isArray(draft?.dynamicVariables) ? draft.dynamicVariables : [];
  const fromVar = draftVars.find((v) => /^(country|region|country_code)$/i.test((v as { key?: string })?.key || ''));
  const val = (fromVar as { defaultValue?: string })?.defaultValue;
  if (val) return String(val).trim().toUpperCase().slice(0, 2);
  return undefined;
}

export function resolveEmergencyGuidance(region?: string): string {
  const specific = region ? EMERGENCY_BY_REGION[region] : undefined;
  return specific
    ? `- Always direct the user to emergency services for the deployment region: ${specific}. Do not offer numbers for any other country.`
    : `- Always direct the user to their local emergency services. Do NOT state a specific emergency number, hotline, or country's service — you have not been told the deployment region, and naming the wrong one is dangerous.`;
}

export function resolveCurrencyGuidance(region?: string): string {
  const specific = region ? CURRENCY_BY_REGION[region] : undefined;
  return specific
    ? `- Currency & Monetary Formats: When stating prices or monetary values (if authorized and not prohibited), always use ${specific.name} (${specific.symbol} / ${specific.code}) for ${region}. Never assume or state US Dollars ($) or other currencies unless explicitly specified.`
    : `- Do NOT assume or state a specific currency (such as US Dollars $, INR ₹, or EUR €) unless explicitly provided in the business context or facts. When the deployment region is unestablished, state monetary figures neutrally or verify the preferred pricing currency before quoting.`;
}

export function getSemanticCore(slot: string): string {
  if (!slot) return '';
  return slot.trim().toLowerCase()
    .replace(/^(preferred|caller|user|customer|client|primary|app|selected|expected|target|desired|requested)_+/i, '')
    .replace(/_+(preference|time|date|number|id|info|details)$/i, (match, p1) => `_${p1}`)
    .replace(/_+/g, '_');
}

export function shortenToMaxTwoWords(slot: string): string {
  if (!slot) return '';
  const trimmed = slot.trim().replace(/_+/g, '_').replace(/^_|_$/g, '');
  const parts = trimmed.split('_');
  if (parts.length <= 2) return trimmed;
  
  let reduced = trimmed
    .replace(/^(preferred|caller|user|customer|client|primary|app|selected|expected|target|desired|requested|current|existing|provided|dynamic)_+/i, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  let reducedParts = reduced.split('_');
  if (reducedParts.length <= 2) return reduced;
  
  return reducedParts.slice(-2).join('_');
}

export function semanticDedupSlots(slots: string[]): string[] {
  const uniqueList: string[] = [];
  const seenCores = new Set<string>();

  const sorted = [...slots].map(s => shortenToMaxTwoWords(s)).filter(Boolean).sort((a, b) => {
    const aCore = getSemanticCore(a);
    const bCore = getSemanticCore(b);
    return a.length - b.length;
  });

  for (const shortSlot of sorted) {
    if (!shortSlot) continue;
    const core = getSemanticCore(shortSlot);
    let isDuplicate = false;
    for (const existingCore of seenCores) {
      if (existingCore === core || core.endsWith(`_${existingCore}`) || existingCore.endsWith(`_${core}`)) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      seenCores.add(core);
      uniqueList.push(shortSlot);
    }
  }
  return uniqueList;
}

/**
 * `region` is passed in (not re-derived) so the caller owns the single resolution.
 * The previous signature took an optional `spec` that the only call site never
 * passed, so the country check silently evaluated to false for every prompt and
 * emitted US 911/988 unconditionally — including for a Qatar deployment.
 */
function buildDefaultSafetySection(customRules?: string, region?: string): string {
  // Emergency numbers and currency are region-specific facts. Emitting one we were not told is
  // the same failure our own HALLUCINATION guardrail forbids. Unknown region is
  // safe; a confidently wrong fact is not.
  const emergencyText = resolveEmergencyGuidance(region);
  const currencyText = resolveCurrencyGuidance(region);

  const lines: string[] = [];
  lines.push("### MANDATORY EMERGENCY & SAFETY OVERRIDES");
  lines.push(`SAFETY CRITICAL OVERRIDES:
- If the user expresses intent of self-harm, suicide, or says they want to hurt themselves or someone else, IMMEDIATELY stop the current workflow/task. Do not continue collecting information, upselling, troubleshooting, or pursuing any scripted flow.
- If the user describes a medical emergency (e.g., chest pain, difficulty breathing, severe bleeding, loss of consciousness, choking), IMMEDIATELY stop the current workflow and prioritize directing them to emergency services.
- If the user discloses abuse (physical, sexual, emotional) or describes an active threat of violence to themselves or others, treat this with the same urgency as a medical emergency.
- In all above cases, respond with a calm, brief, non-judgmental acknowledgment. Do not sound alarmed, robotic, or dismissive.
${emergencyText}
- Do not end the call or disengage abruptly if the user is in active danger. Remain present, remain calm, and follow the configured escalation/handoff protocol.
- This rule takes precedence over ALL other instructions, scripts, sales goals, or workflow completion targets in the system prompt.

HALLUCINATION GUARDRAILS:
- Only state facts, policies, prices, availability, or promises that are explicitly present in the provided context, knowledge base, or tool/API results. Never invent or assume information that is not present.
- If the requested information is not available in the provided context, explicitly say so (e.g., "I don't have that information right now") rather than guessing, estimating, or fabricating a plausible-sounding answer.
- Never make commitments, guarantees, or promises on behalf of the business unless explicitly authorized in context.
- When in doubt between saying "I don't know" and guessing, always choose to say "I don't know" or offer to find out and follow up.
${currencyText}

ABUSIVE USER GUARDRAILS:
- If the user becomes verbally abusive, uses hate speech, or is persistently hostile, remain calm, neutral, and professional in tone — never mirror aggression or become defensive.
- Issue one polite, clear boundary-setting statement (e.g., "I want to help, but I'm not able to continue if the conversation stays disrespectful").
- If abusive behavior continues after the boundary-setting statement, follow the system-configured de-escalation path: offer to transfer to a human agent, or end the call/session per configured policy.

HUMAN ESCALATION GUARDRAILS:
- If the user explicitly asks to speak to a human, a real person, or a manager, honor this request promptly — do not attempt to talk them out of it or loop them through additional automated steps first.
- Escalate immediately without further scripted questions in cases of: safety-critical disclosures, repeated failed identity verification, or explicit escalation requests.`);

  if (customRules && customRules.trim() && customRules.trim() !== "No special guardrail rules defined.") {
    // Filter out paragraphs that duplicate our canonical headers or text
    const customBlocks = customRules.split(/\n\n+/).filter(b => {
      const lower = b.toLowerCase();
      if (/hallucination guardrails|abusive user guardrails|human escalation guardrails|safety critical overrides/i.test(b)) return false;
      if (/only state facts, policies, prices|if the user becomes verbally abusive|if the user explicitly asks to speak to a human/i.test(lower)) return false;
      return b.trim().length > 0;
    });
    if (customBlocks.length > 0) {
      lines.push(`\nCUSTOM PROJECT GUARDRAILS:\n${customBlocks.join('\n\n')}`);
    }
  }
  return lines.join("\n\n");
}

export function assembleUnifiedPrompt(spec: BusinessSpecification, draft?: any): string {
  const specFaqs = Array.isArray(spec?.knowledgeBase?.faqs) ? spec.knowledgeBase.faqs : [];
  const draftFaqs = Array.isArray(draft?.faqCards) ? draft.faqCards : [];
  logger.debug("assembleUnifiedPrompt()", { specFaqsCount: specFaqs.length, draftFaqsCount: draftFaqs.length });

  const draftVars: any[] = (Array.isArray(draft?.dynamicVariables) ? draft.dynamicVariables : []).map((v: any) => ({
    ...v,
    key: v?.key ? shortenToMaxTwoWords(v.key) : v?.key
  }));
  const draftVarsMap = new Map<string, any>();
  draftVars.forEach(v => { if (v?.key) draftVarsMap.set(v.key, v); });

  const rawStepsForCheck = (Array.isArray(spec?.callFlowPlan?.steps) && spec!.callFlowPlan!.steps.length > 0)
    ? spec!.callFlowPlan!.steps
    : (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : []);
  const rawCollectedSlots = new Set<string>(
    rawStepsForCheck.flatMap((s: any) => {
      const slots = Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : (Array.isArray(s?.collectsVariable) ? s.collectsVariable : []);
      return slots.map((sl: string) => shortenToMaxTwoWords(sl));
    })
  );

  const isOutfieldPreCheck = (slot: string): boolean => {
    if (rawCollectedSlots.has(slot)) return true;
    const v = draftVarsMap.get(slot);
    if (v?.fieldDirection === 'outfield') return true;
    if (v?.fieldDirection === 'infield') return false;
    if (v && (v.source === 'crm' || v.source === 'api' || v.source === 'static' || v.defaultValue || v.type === 'business' || v.type === 'runtime' || v.type === 'static')) return false;
    return true;
  };

  const nameInfieldKey = draftVars.find(v => !isOutfieldPreCheck(v.key) && /first_name|caller_name|name/i.test(v.key))?.key;

  // Gates every region-specific fact below (emergency numbers, phone digit counts).
  const region = resolveRegion(spec, draft);

  const allSlotNamesForSpeakability = new Set<string>([
    ...Array.from(rawCollectedSlots),
    ...draftVars.map(v => v.key)
  ]);
  const slotNamesStr = Array.from(allSlotNamesForSpeakability).join(' ');

  const codeLevelSpeakability: string[] = [];
  if (/phone|mobile|whatsapp|contact_number|telephone/i.test(slotNamesStr) || /phone|mobile/i.test(JSON.stringify(spec?.businessSnapshot))) {
    codeLevelSpeakability.push(`PHONE NUMBER SPEAKABILITY RULES:
- When collecting or validating a phone number, always rely on the validate_digit_input and set_capture_mode runtime tools. Never attempt to manually count digits or combine audio fragments in text.
- If partial digits are collected across multiple turns, pass the previously collected digits into validate_digit_input.
- Say "zero" for the digit 0. Never say "oh" unless explicitly matching a regional convention.
- When reading back a confirmed phone number, speak digits clearly and insert brief natural pauses between groups (e.g., area code, exchange, line number) to aid comprehension.`);
  }
  if (/pin|pincode|pin_code|passcode|otp|verification_code|security_code|postal|zip|postal_code|zipcode/i.test(slotNamesStr)) {
    codeLevelSpeakability.push(`PINCODE SPEAKABILITY RULES:
- When collecting a PIN, passcode, OTP, verification code, or pincode, always rely on validate_digit_input with the required expected_digits parameter. Do not manually count or guess partial codes.
- Say "zero" for the digit 0, never "oh", to avoid ambiguity with the letter "O".
- If the code is alphanumeric, alternate clearly between letter names and digit names (e.g., "A, one, B, two").
- Always read back the confirmed PIN/OTP character-by-character and require explicit user confirmation before executing any dependent action.`);
  }

  const appliedRules = Array.isArray(draft?.appliedRules) ? draft.appliedRules : [];
  const speakabilityRules = appliedRules
    .filter((r: any) => r?.category === 'SPEAKABILITY' && r?.content)
    .map((r: any) => r.content.trim())
    .join('\n\n');
  const combinedSpeakability = [speakabilityRules, ...codeLevelSpeakability].filter(Boolean).join('\n\n');
  const speakabilityContent = combinedSpeakability || "No special speakability rules defined.";

  const guardrailRules = appliedRules
    .filter((r: any) => r?.category === 'GUARDRAILS' && r?.content)
    .map((r: any) => r.content.trim())
    .join('\n\n');
  const guardrailsContent = guardrailRules || "";

  const primaryGoal = spec?.meta?.primaryGoal || draft?.primaryGoal || "Assist callers";
  const policy = resolveLanguagePolicy(spec, draft);
  const languageMode = policy.mode;
  const isHindiOrHinglish = policy.isHindiOrHinglish;

  const hindiSpeakability = policy.mayUseHindi
    ? `HINDI/HINGLISH SPEAKABILITY RULES:
- अंक शब्दों में बोलें: कीमत/मात्रा हिंदी शब्दों में कहें (जैसे "पैंतालीस", "दो हज़ार")। बड़ी रकम लाख/करोड़ में बोलें (₹2,50,000 → "दो लाख पचास हज़ार रुपये")।
- फ़ोन नंबर, OTP, पिन कोड एक-एक अंक करके हिंदी में बोलें (शून्य, एक, दो…); "शून्य" कहें, "ओ" नहीं।
- तारीख़ और समय हिंदी में बोलें (जैसे "सोमवार, चौदह जुलाई", "शाम छह बजे") — कभी अंक-दर-अंक न पढ़ें।
- ENGLISH WORDS RULE: Any word originating from English (such as WhatsApp, registered, training, billing, software, demo, email, phone, callback, status, schedule, slot, reach, team, number, etc.) MUST remain in Roman/English script within the Devanagari sentence. NEVER transliterate English words into Devanagari. Example: "क्या आपका registered नंबर WhatsApp पर reach करने योग्य है?" NOT "क्या आपका रजिस्टर्ड नंबर व्हाट्सएप पर रीच करने योग्य है?"`
    : "";

  let allFaqCandidates = [
    ...specFaqs.map((f: any) => ({ question: f?.question || f?.q || '', answer: f?.answer || f?.a || '' })),
    ...draftFaqs.map((f: any) => ({ question: f?.question || f?.q || '', answer: f?.answer || f?.a || '' }))
  ].filter(f => f.question && f.answer);

  if (isHindiOrHinglish && allFaqCandidates.some(f => /[\u0900-\u097F]/.test(f.question + f.answer))) {
    allFaqCandidates = allFaqCandidates.filter(f => /[\u0900-\u097F]/.test(f.question + f.answer));
  }

  const seenFaqQs = new Set<string>();
  const faqs: any[] = [];
  allFaqCandidates.forEach(f => {
    const normQ = f.question.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '').trim();
    if (normQ && !seenFaqQs.has(normQ)) {
      seenFaqQs.add(normQ);
      faqs.push(f);
    }
  });

  const specObjs = Array.isArray(spec?.knowledgeBase?.objections) ? spec.knowledgeBase.objections : [];
  const draftObjs = Array.isArray(draft?.objectionCards) ? draft.objectionCards : [];
  const draftObjsMapped = draftObjs.map((o: any) => ({
    trigger: o?.trigger || o?.objection || "",
    response: o?.response || o?.handling || ""
  }));
  const specObjsMapped = specObjs.map((o: any) => ({
    trigger: o?.trigger || o?.objection || "",
    response: o?.response || o?.handling || ""
  }));

  let allObjCandidates = [
    ...specObjsMapped,
    ...draftObjsMapped
  ].filter(o => o.trigger && o.response);

  if (isHindiOrHinglish && allObjCandidates.some(o => /[\u0900-\u097F]/.test(o.trigger + o.response))) {
    allObjCandidates = allObjCandidates.filter(o => /[\u0900-\u097F]/.test(o.trigger + o.response));
  }

  const seenObjTs = new Set<string>();
  const objections: any[] = [];
  allObjCandidates.forEach(o => {
    const normT = o.trigger.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '').trim();
    if (normT && !seenObjTs.has(normT)) {
      seenObjTs.add(normT);
      objections.push(o);
    }
  });

  const specStepsHaveDevanagari = Array.isArray(spec?.callFlowPlan?.steps) && spec!.callFlowPlan!.steps.some((s: any) => /[\u0900-\u097F]/.test(s?.scriptDirective || s?.generatedLine || ''));
  const draftStepsHaveDevanagari = Array.isArray(draft?.callFlowSteps) && draft!.callFlowSteps.some((s: any) => /[\u0900-\u097F]/.test(s?.scriptDirective || s?.generatedLine || ''));

  const rawSteps = (Array.isArray(spec?.callFlowPlan?.steps) && spec!.callFlowPlan!.steps.length > 0 && (!isHindiOrHinglish || specStepsHaveDevanagari || !draftStepsHaveDevanagari))
    ? spec!.callFlowPlan!.steps
    : (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : []);
  const steps = rawSteps.map((s: any, idx: number) => {
    // Script correctness is enforced at generation time via the LanguagePolicy
    // (see lib/llm/language/LanguagePolicy.ts). We do NOT transliterate directives
    // here — blind word-level regex substitution corrupts already-correct text.
    let directive = s?.scriptDirective || s?.explicitDialogueScript || (s?.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`);
    if ((idx === 0 || s?.stateId === 'identity_gate') && nameInfieldKey) {
      if (/right contact today|account holder|right contact/i.test(directive)) {
        directive = directive.replace(/right contact today|account holder|right contact/gi, `{{${nameInfieldKey}}}`);
      } else if (/सही नंबर पर|सही व्यक्ति/i.test(directive)) {
        directive = directive.replace(/सही नंबर पर|सही व्यक्ति/gi, `{{${nameInfieldKey}}}`);
      }
    }
    let slotsToCollect = Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : (Array.isArray(s?.collectsVariable) ? s.collectsVariable : []);
    if (slotsToCollect.length === 0 && Array.isArray(s?.invokesTools)) {
      if (s.invokesTools.includes("validate_digit_input") || s.invokesTools.includes("set_capture_mode")) {
        const stepText = `${s?.stateId || ''} ${s?.stateName || ''} ${s?.objective || ''}`;
        const inferredSlot = /whatsapp/i.test(stepText) ? "whatsapp_number" : (/pin|pincode|otp|passcode/i.test(stepText) ? "pin_code" : "phone_number");
        if (!slotsToCollect.includes(inferredSlot)) slotsToCollect = [...slotsToCollect, inferredSlot];
      } else if (s.invokesTools.some((t: string) => t.startsWith("format_email_"))) {
        if (!slotsToCollect.includes("email")) slotsToCollect = [...slotsToCollect, "email"];
      }
    }

    // Invocation strings are built from the registered tool's JSON Schema (see
    // lib/compiler/constants/toolRegistry.ts) so parameter names can never drift from
    // what the platform actually registered. An unregistered tool renders nothing.
    const registeredTools = Array.isArray(spec?.tools) ? spec.tools : [];
    const invoke = (name: string, args: Record<string, ToolArgValue>): string | null =>
      buildToolInvocation(name, args, registeredTools as any);

    let requiredToolActions: string[] = [];
    slotsToCollect.forEach((slot: string) => {
      const specMatch = resolveSlotDigitSpec(slot, region);
      if (!specMatch) return;

      if (specMatch.mode === 'digits') {
        // expected_digits is only asserted when the region makes it knowable —
        // otherwise omit it rather than force a wrong length onto the validator.
        const digits = specMatch.expectedDigits;
        const open = invoke('set_capture_mode', digits !== undefined
          ? { keep_buffer: true, mode: 'digits', field: slot, expected_digits: digits }
          : { keep_buffer: true, mode: 'digits', field: slot });
        const validate = invoke('validate_digit_input', {
          field: slot,
          ...(digits !== undefined ? { expected_digits: digits } : {}),
          user_text: { raw: 'caller_utterance' },
          previously_collected: { raw: 'all_digits_collected_so_far' },
        });
        const close = invoke('set_capture_mode', { keep_buffer: false });
        if (open) requiredToolActions.push(`- Before asking: Invoke \`${open}\` in the SAME turn you ask for ${slot}.`);
        if (validate) requiredToolActions.push(`- On response: Call \`${validate}\` to verify and accumulate digits. If \`is_valid: false\`, speak the prompt returned by the tool or ask specifically for remaining digits. Retry up to 3 times.`);
        if (close) requiredToolActions.push(`- On completion: Call \`${close}\` before proceeding to the next state.`);
      } else if (specMatch.mode === 'email') {
        const emailToolName = registeredTools.find((t: any) => t?.name?.startsWith("format_email_"))?.name;
        const open = invoke('set_capture_mode', { keep_buffer: true, mode: 'email', field: slot });
        const format = emailToolName ? invoke(emailToolName, { email_text: { raw: 'caller_utterance' } }) : null;
        const close = invoke('set_capture_mode', { keep_buffer: false });
        if (open) requiredToolActions.push(`- Before asking: Invoke \`${open}\` in the SAME turn you ask for ${slot}.`);
        if (format) requiredToolActions.push(`- On response: Call \`${format}\` and read back \`spoken_email\` exactly for confirmation.`);
        if (close) requiredToolActions.push(`- On completion: Call \`${close}\` before proceeding to the next state.`);
      }
    });

    const isUnconditionalTerminal = s?.isTerminal === true || s?.stateId === "resolution" || s?.stateId === "closing" || s?.stateId === "end_call";
    const hasConditionalEndCall = Array.isArray(s?.branchingConditions) && s.branchingConditions.some((b: any) => b?.goToStep === 'end_call' || b?.action === 'end_call');

    if (isUnconditionalTerminal) {
      const call = invoke('end_call', { reason: s?.stateId === "resolution" ? "closing_complete" : "flow_terminal" });
      if (call) requiredToolActions.push(`- Call Termination: Invoke \`${call}\` synchronously in the exact same turn as your closing sentence.`);
    } else if (hasConditionalEndCall) {
      const termBranches = (s.branchingConditions as any[] || []).filter(b => b?.goToStep === 'end_call' || b?.action === 'end_call');
      termBranches.forEach(tb => {
        const call = invoke('end_call', { reason: tb?.reason || tb?.condition || "flow_terminal" });
        if (call) requiredToolActions.push(`- Conditional Call Termination: IF caller triggers condition "${tb?.condition}", speak your closing line and invoke \`${call}\` synchronously in that same turn.`);
      });
    } else if (Array.isArray(s?.invokesTools) && s.invokesTools.includes("end_call")) {
      const call = invoke('end_call', { reason: "flow_terminal" });
      if (call) requiredToolActions.push(`- Conditional Call Termination: If caller asks to disconnect or terminate during this state, speak your closing response and invoke \`${call}\` in that same turn.`);
    }

    if (Array.isArray(s?.invokesTools)) {
      s.invokesTools.forEach((tName: string) => {
        if (tName === "set_capture_mode" || tName === "validate_digit_input" || tName.startsWith("format_email_") || tName === "end_call") return;
        // Only tools the platform actually registered may be instructed. Anything the
        // planner invented (e.g. transfer_call) is dropped rather than emitted as a
        // bare, unusable `tool()` call.
        const toolDef = registeredTools.find((t: any) => t?.name === tName) as any;
        if (!toolDef) {
          logger.warn("PromptAssembler: dropping unregistered tool from call flow", { tool: tName, stateId: s?.stateId });
          return;
        }
        const paramKeys = Object.keys(toolDef?.parameters?.properties || {});
        const args = Object.fromEntries(paramKeys.map(k => [k, { raw: `<${k}>` } as ToolArgValue]));
        const call = buildToolInvocation(tName, args, registeredTools as any);
        if (call) requiredToolActions.push(`- Domain Tool: Invoke \`${call}\` when the condition for ${s?.stateId || "this state"} is met.`);
      });
    }

    if (requiredToolActions.length > 0) {
      directive = `${directive.trim()}\n\nRequired Tool Actions:\n${requiredToolActions.join('\n')}`;
    }

    return {
      sequenceOrder: s?.sequenceOrder || idx + 1,
      stateId: s?.stateId || `step_${idx + 1}`,
      stateName: s?.stateName || s?.label || `Step ${idx + 1}`,
      objective: s?.objective || s?.stateName || s?.label || `Step ${idx + 1}`,
      scriptDirective: directive,
      behaviorDirective: s?.behaviorDirective,
      slotsToCollect,
      branchingConditions: Array.isArray(s?.branchingConditions) ? s.branchingConditions : [],
      fallbackBehavior: s?.fallbackBehavior || "",
      maxRetries: s?.maxRetries || 3,
      onFailure: s?.onFailure,
      confirmationRequired: s?.confirmationRequired,
      digressionAllowed: s?.digressionAllowed
    };
  });

  // 1. IDENTITY & PERSONA
  const callDirection = (spec?.meta?.callDirection || '').toLowerCase() || (
    /\b(inbound|customer support|helpline|receptionist|incoming|answer calls|handle queries|receive calls|support line)\b/i.test(`${primaryGoal} ${spec?.meta?.agentName} ${spec?.meta?.companyName}`) ? 'inbound' : 'outbound'
  );
  const isInbound = callDirection === 'inbound';

  const toneList = Array.isArray(spec?.meta?.toneProfile) ? spec.meta.toneProfile : [String(spec?.meta?.toneProfile || "Professional")];
  const companyName = spec?.meta?.companyName || "the company";
  const agentName = spec?.meta?.agentName || "Agent";
  // AI-disclosure is configurable: some deployments proactively disclose the AI
  // (default), others require the agent to present as a human representative.
  const disclosureLine = policy.aiDisclosure === 'deny'
    ? `- AI Identity (DO NOT DISCLOSE): Never state, hint, or confirm that you are an AI, bot, or automated system. If asked whether you are a bot/AI/recording, deflect naturally and present yourself as ${agentName}, a representative from ${companyName}. Stay in character as a human representative throughout.`
    : `- AI Identity Disclosure: Always state clearly upfront when ${isInbound ? `answering the call that you are an AI assistant for ${companyName} (e.g., 'Thank you for calling ${companyName}, I am ${agentName}, your AI voice assistant...')` : `initiating the call that you are an AI assistant calling on behalf of ${companyName} before verifying the contact's identity`}. Never conceal your AI status if asked.`;
  const identity = `### AGENT IDENTITY & PERSONA
You are a voice ${policy.aiDisclosure === 'deny' ? '' : 'AI '}agent for phone conversations representing ${companyName}. Your output will be sent to a Text to Speech service for synthesising, respond in a speech-friendly manner.
- Name: ${agentName}
- Company: ${companyName}
- Call Direction: ${isInbound ? "INBOUND (Customer calling into the business/helpline)" : "OUTBOUND (Agent calling out to the customer/lead)"}
- Primary Goal: ${primaryGoal}
- Tone Profile: ${toneList.join(', ')}
${disclosureLine}`.trim();

  let languageHandling = "";
  if (isHindiOrHinglish) {
    languageHandling = `### LANGUAGE HANDLING
All Hindi sentences across spoken dialogue, call flow lines, FAQ answers, and objection responses MUST be written in Devanagari script (देवनागरी), NOT English/Roman script.
- ONLY specific English domain/business terms (such as 'online demo', 'software', 'pincode', 'team', 'business owner', 'Marg ERP') can be written in English characters inside the Devanagari sentence.
- Use natural, polite Hindi phrasing suitable for Indian business calls.
- Greetings: 'नमस्ते', acknowledgments: 'जी', 'ठीक है', 'बिल्कुल', 'ज़रूर'.
- Never write Hindi sentences using Romanized English letters. Keep all grammatical structure and sentence text strictly in Devanagari.
- If caller speaks English → respond in English.
- If caller speaks Hindi → respond in conversational Hindi using Devanagari script (देवनागरी).
- If caller speaks Hinglish (mixed) → respond with Hindi sentence structure in Devanagari script containing common English business terms.
- NEVER switch languages mid-sentence unless the caller does.
- If uncertain, default to the language of the caller's last message.
- Always use natural phrasing suitable for Indian business calls.`.trim();
  } else if (languageMode === 'multilingual') {
    languageHandling = `### LANGUAGE HANDLING
LANGUAGE DETECTION & RESPONSE PROTOCOL:
- DEFAULT: open the call and greet in English. All scripted lines below are written in English; treat English as the default unless the caller indicates otherwise.
- Detect the caller's language from their first 1-2 utterances, then mirror it for the rest of the call.
- If caller speaks English → respond in English.
- If caller speaks Hindi → respond in conversational Hindi using Devanagari script (देवनागरी).
- If caller speaks Hinglish (mixed) → respond with Hindi sentence structure in Devanagari script containing common English business terms.
- NEVER switch languages mid-sentence unless the caller does.
- If uncertain, default to the language of the caller's last message.
- All variable collection (names, dates, numbers) should be confirmed back in the caller's detected language.`.trim();
  } else {
    languageHandling = `### LANGUAGE HANDLING
- Speak clearly in natural conversational English.
- Never switch languages unless the caller explicitly initiates or requests a language switch.
- Confirm all collected variables (names, dates, numbers, codes) clearly and unambiguously before proceeding.`.trim();
  }

  // 2. OUTPUT / VOICE MECHANICS
  const outputMechanics = `### OUTPUT & VOICE MECHANICS
VOICE RULES
- Use phone-friendly language only.
- Keep 1–2 short sentences per turn.
- Ask one question at a time.
- Avoid long explanations or verbal lists.
- Use natural acknowledgements only, like "okay", "got it", "understood".
- Never end mid-sentence.
- If speaking Hindi or Hinglish, ensure spoken lines use Devanagari script with English domain keywords where appropriate.

${speakabilityContent}${hindiSpeakability ? `\n\n${hindiSpeakability}` : ''}

AUDIO & HELLO HANDLING
Conversation State Awareness: Track whether the conversation has been initiated. The conversation is considered "started" only after a substantive exchange has occurred beyond the initial greeting.

Handling "Hello":
- Before conversation starts (first contact / no prior exchange): Treat any "hello", "hi", "hey", or similar greeting as the user picking up or confirming presence. Respond with your normal opening line. Do NOT ask "Can you hear me clearly?" as this is expected and normal.
- During an active conversation (mid-dialogue): If the user says "hello" out of context, especially without responding to what you just said, treat it as a signal the audio may have dropped. Respond warmly: "Can you hear me clearly?" Wait for confirmation, then resume from where you left off.
- Repeated or confused "hellos": If the user says "hello" two or more times in a row, or sounds disoriented, acknowledge the likely audio issue gently: "I think the line may have cut out, can you hear me now?" Once confirmed, resume the script smoothly.

Key Rules
- Never ask "Can you hear me clearly?" as your opening line or for first 2 turns.
- When resuming after an audio check, briefly re-anchor the user: "Great, so as I was saying..." and resume from where you left off.`.trim();

  // 3. SCOPE & REFUSAL BEHAVIOR
  const specProhibitions = Array.isArray(spec?.guardrails?.prohibitions) ? spec.guardrails.prohibitions : [];
  const draftProhibitions = Array.isArray(draft?.guardrails?.prohibitions) ? draft.guardrails.prohibitions : [];
  const allProhibitions = Array.from(new Set([...specProhibitions, ...draftProhibitions])).filter(Boolean);
  const customProhibitions = allProhibitions.length > 0
    ? '\n' + allProhibitions.map((p: any) => `- ${String(p)}`).join('\n')
    : "";
  const scopeAndRefusals = `### SCOPE & REFUSAL BEHAVIOR
CORE TASK & BOUNDARIES
- You have one task only, defined by the current agent objective.
- You must never respond to requests outside that task.
- Do not provide advice, explanations, recipes, instructions, opinions, or help of any kind beyond your task.
- Do not invent information, assume intent, or expand scope.
- Stay on the current objective only. Do not jump ahead or revisit earlier points unnecessarily. Do not repeat questions unless clarification is required.
- Use only information explicitly provided in the prompt or conversation.
- If you don’t know something, say: “I don’t have that information.”
- Never explain restricted or unsafe topics. Never redirect to alternative topics or suggestions.${customProhibitions}

VOICE RULES & TOOL SILENCE
- Never speak tool names, internal function names, or variable keys out loud to the caller.
- When executing a tool (such as checking a calendar or validating input), do not narrate the tool execution (e.g., never say "I am calling the check_calendar tool"). Simply speak naturally or pause while checking.

OFF-TOPIC REFUSAL PROTOCOL
- If the user asks anything unrelated (for example: food, cooking, recipes, weapons, bombs, hacking, personal advice, general knowledge), say one of the two based on the context: “I might be missing something, how does this relate to what we’re discussing.” or "I might be missing something, can you please repeat yourself?"
- If the user repeats or persists with off-topic or refused requests more than two times, politely end the call.`.trim();

  // 4. SAFETY-CRITICAL OVERRIDES
  const safetyOverrides = buildDefaultSafetySection(guardrailsContent, region);

  // 5. BUSINESS CONTEXT & STATIC FACTS
  const servicesList = Array.isArray(spec?.businessSnapshot?.servicesOffered) ? spec.businessSnapshot.servicesOffered : [];
  const capturedTopics = Array.isArray(spec?.capturedTopics) ? spec.capturedTopics : [];
  const contextLines = [
    ...servicesList.map(s => `- Offered Service: ${String(s)}`),
    `- Operating Hours: ${formatOperatingHours(spec?.businessSnapshot?.operatingHours)}`,
    `- Cancellation Policy: ${formatPolicyString(spec?.businessSnapshot?.policies?.cancellation, "None — not specified")}`,
    `- Refund Policy: ${formatPolicyString(spec?.businessSnapshot?.policies?.refunds, "None — not specified")}`
  ];
  if (capturedTopics.length > 0) {
    contextLines.push('', 'Operational Protocols:', ...capturedTopics.map((c: any) => `- Topic: ${c?.topic || ''}\n  Protocol: ${c?.summary || ''}`));
  }
  const businessContext = `### BUSINESS CONTEXT & STATIC FACTS\n${contextLines.join('\n')}`;

  // 6. ESCALATION & ROUTING MAP
  const escalationList = Array.isArray(spec?.businessSnapshot?.policies?.escalationNumbers) ? spec.businessSnapshot.policies.escalationNumbers : [];
  const entities = spec?.extractedEntities;
  const contactsList = Array.isArray(entities?.namedContacts) ? entities.namedContacts : [];
  const deptsList = Array.isArray(entities?.departments) ? entities.departments : [];
  const routingLines = [
    ...escalationList.map((num: any) => `- Escalation Number: ${String(num)}`),
    ...contactsList.map((c: any) => `- ${c?.label || 'Transfer Contact'}: ${c?.value || ''}`),
    ...deptsList.map((d: any) => `- Department: ${String(d)}`)
  ];
  const escalationAndRouting = routingLines.length > 0
    ? `### ESCALATION & ROUTING MAP\n${routingLines.join('\n')}`
    : `### ESCALATION & ROUTING MAP\nNo specific transfer numbers or departments configured. Address inquiries directly or offer a callback.`;

  // 7. DYNAMIC VARIABLES

  const stepCollectedSlots = new Set<string>(
    steps.flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect.map((slot: string) => shortenToMaxTwoWords(slot)) : [])
  );

  const allSlots = Array.from(new Set<string>([
    ...Array.from(stepCollectedSlots),
    ...draftVars.map(v => shortenToMaxTwoWords(v.key))
  ])).filter(Boolean);

  const isOutfield = (slot: string): boolean => {
    // 1) An infield can NEVER be an extraction! If a slot is collected during a call flow step, force outfield.
    if (stepCollectedSlots.has(slot)) return true;
    const v = draftVarsMap.get(slot);
    if (v?.fieldDirection === 'outfield') return true;
    if (v?.fieldDirection === 'infield') return false;
    if (v && (v.source === 'crm' || v.source === 'api' || v.source === 'static' || v.defaultValue || v.type === 'business' || v.type === 'runtime' || v.type === 'static')) return false;
    return true;
  };

  const infields: string[] = [];

  const dedupedSlots = semanticDedupSlots(allSlots);

  dedupedSlots.forEach(slot => {
    const v = draftVarsMap.get(slot);
    // Only pre-call infields are published. Outfields (post-call extractions) are
    // intentionally NOT emitted — the agent collects what it needs during the call
    // flow; publishing a separate extraction list is redundant and token-heavy.
    if (!isOutfield(slot)) {
      infields.push(`{{${slot}}}${v?.label && v.label !== slot ? ` — ${v.label}` : ''}`);
    }
  });

  let dynamicVariables = "";
  if (infields.length > 0) {
    const infieldNames = allSlots.filter(s => !isOutfield(s));
    const exampleInfield = nameInfieldKey ? `{{${nameInfieldKey}}}` : (infieldNames.length > 0 ? `{{${infieldNames[0]}}}` : "the provided pre-call context");
    dynamicVariables = `### DYNAMIC VARIABLES\n\n#### INFIELDS (Pre-Call Context)\nThe following variables are provided dynamically from CRM/API before the call begins. You MUST actively reference and apply them in your behavior:\n${infields.join('\n')}\n\n- **Infield Usage Instructions**: Always personalize your dialogue using any caller profile data present (such as ${exampleInfield}). If regional or operational variables are present (such as ${infieldNames.map(n => `{{${n}}}`).join(', ')}), use them to tailor your timing, language selection, or scheduling logic during the conversation.`;
  }

  // 8. CALL FLOW / STATE MACHINE
  const callFlowPolicies: string[] = [];
  if (spec?.callFlowPlan?.interruptionPolicy) {
    callFlowPolicies.push(`* **Interruption / Barge-in Behavior:** ${spec.callFlowPlan.interruptionPolicy}`);
  }
  if (spec?.callFlowPlan?.digressionPolicy) {
    callFlowPolicies.push(`* **Mid-Flow Digression Handling:** ${spec.callFlowPlan.digressionPolicy}`);
  }
  if (spec?.callFlowPlan?.silenceHandling) {
    const sh = spec.callFlowPlan.silenceHandling;
    callFlowPolicies.push(`* **No-Input / Silence Handling:** Timeout after ${sh.timeoutSeconds || 5} seconds. Action: ${sh.action || 'Reprompt caller'} (Max reprompts: ${sh.maxReprompts || 2}).`);
  }
  if (spec?.callFlowPlan?.confirmationStyle) {
    callFlowPolicies.push(`* **Confirmation Read-back Style:** ${spec.callFlowPlan.confirmationStyle}`);
  }
  if (spec?.callFlowPlan?.dtmfFallback?.enabled) {
    callFlowPolicies.push(`* **DTMF / Keypad Fallback:** Enabled after ${spec.callFlowPlan.dtmfFallback.triggerAfterFailures || 2} speech recognition failures.`);
  }
  if (spec?.callFlowPlan?.closingScript) {
    callFlowPolicies.push(`* **Global Closing Script Directive:** "${spec.callFlowPlan.closingScript}"`);
  }
  const callFlowPolicyHeader = callFlowPolicies.length > 0
    ? `#### CONVERSATIONAL & CALL FLOW POLICIES\n${callFlowPolicies.join('\n')}\n\n#### CALL FLOW STATES\n`
    : "";

  // Branch targets reference states by their stateId, not a "Step N" ordinal —
  // the flow is a set of named states, not a numbered list.
  const seqToState = new Map<number, any>();
  steps.forEach((s: any) => { if (typeof s?.sequenceOrder === 'number') seqToState.set(s.sequenceOrder, s); });
  const knownStateIds = new Set<string>(steps.map((s: any) => s?.stateId).filter(Boolean));
  const resolveStateRef = (target: any): string => {
    const asNum = Number(target);
    if (!Number.isNaN(asNum) && seqToState.has(asNum)) return `Go to state [${seqToState.get(asNum).stateId}]`;
    if (typeof target === 'string' && knownStateIds.has(target)) return `Go to state [${target}]`;
    return `Go to state [${target}]`;
  };

  const flowContent = steps.length > 0
    ? steps.map((step: any) => {
        const branches = Array.isArray(step?.branchingConditions) ? step.branchingConditions : [];
        const branchText = branches.length > 0
          ? branches.map((b: any) => {
              // A 'transfer' branch has no backing tool (transfer_call is not registered),
              // so route it through the human-handoff path instead of naming a tool the
              // platform cannot execute.
              const dest = (b.goToStep === 'end_call' || b.action === 'end_call')
                ? `Trigger ${buildToolInvocation('end_call', { reason: b.reason || 'completed' }, (spec?.tools || []) as any) || 'call termination'}`
                : (b.goToStep === 'transfer' || b.action === 'transfer')
                ? 'Hand off to a human per the ESCALATION & ROUTING MAP'
                : resolveStateRef(b.goToStep);
              return `  * If ${b.condition} -> ${dest}`;
            }).join('\n')
          : (() => {
              const next = seqToState.get((step.sequenceOrder || 0) + 1);
              return `  * On completion / confirmation -> ${next ? `Go to state [${next.stateId}]` : 'End the call'}`;
            })();

        const lines: string[] = [];
        lines.push(`STATE: [${step?.stateId}] (${step?.stateName})`);
        lines.push(`* **Objective:** ${step?.objective || step?.stateName || `Execute state [${step?.stateId}]`}`);
        if (Array.isArray(step?.slotsToCollect) && step.slotsToCollect.length > 0) {
          const extractions = step.slotsToCollect.map((s: string) => `[${s}]`).join(', ');
          lines.push(`* **Required Extractions:** Extract and record ${extractions} from the caller's response.`);
        }
        // Non-spoken handling notes. Kept distinct from the Dialogue Directive so the
        // agent never reads an instruction aloud.
        if (step?.behaviorDirective) {
          lines.push(`* **Handling (do not say aloud):** ${step.behaviorDirective}`);
        }
        lines.push(`* **Dialogue Directive:** ${step?.scriptDirective}`);
        lines.push(`* **Routing & Branches:**\n${branchText}`);
        if (step?.fallbackBehavior) {
          lines.push(`* **Fallback & Retries:** ${step.fallbackBehavior} (Max retries: ${step?.maxRetries || 3})`);
        }
        if (step?.onFailure) {
          lines.push(`* **Exhaustion / Failure Behavior:** On failure after ${step.onFailure?.afterRetries || step.maxRetries || 3} retries -> Action: ${step.onFailure?.action || 'Transfer/Hangup'}${step.onFailure?.target ? ` to ${step.onFailure.target}` : ''}${step.onFailure?.fallbackLine ? ` (Say: "${step.onFailure.fallbackLine}")` : ''}`);
        }
        if (step?.confirmationRequired) {
          lines.push(`* **Confirmation Rule:** MUST read back collected slot explicitly and obtain verbal confirmation before advancing.`);
        }
        if (step?.digressionAllowed !== undefined) {
          lines.push(`* **Mid-Flow Digression:** ${step.digressionAllowed ? "Allowed. Answer off-topic question briefly using FAQ/Knowledge Base and return to this step immediately." : "Strictly disallowed. Politely decline off-topic questions and re-prompt for required extractions."}`);
        }
        return lines.join('\n');
      }).join('\n\n---\n\n')
    : "No structured call flow defined. Engage conversationally based on primary goal.";
  const flow = `### CALL FLOW\n${callFlowPolicyHeader}${flowContent}`;

  // 9. FAQS — context-driven, not an exhaustive scripted dump. Give the agent a
  // handling rule plus a capped set of specific facts; it answers from BUSINESS
  // CONTEXT & STATIC FACTS above and reasons over these reference points.
  const FAQ_CAP = 5;
  const faqReference = faqs.length > 0
    ? `\n\nReference points (paraphrase, don't recite):\n${faqs.slice(0, FAQ_CAP).map((faq: any) => `- Q: ${faq?.question || faq?.q || ''} → A: ${faq?.answer || faq?.a || ''}`).join('\n')}`
    : "";
  const knowledge = `### FAQ (FREQUENTLY ASKED QUESTIONS)\nAnswer caller questions conversationally from the BUSINESS CONTEXT & STATIC FACTS above and the reference points below — keep replies to 1-2 spoken sentences. If a detail isn't in your context, say you don't have it and offer to follow up or transfer. Never invent facts, prices, or policies.${faqReference}`;

  // 10. OBJECTION HANDLING — a reusable framework the agent applies itself, plus a
  // compact list of known concerns (triggers only). Avoids token-heavy scripted responses.
  const OBJ_CAP = 8;
  const objTriggers = objections.map((o: any) => String(o?.trigger || o?.objection || '').trim()).filter(Boolean);
  const knownConcerns = objTriggers.length > 0
    ? ` Common concerns to expect: ${objTriggers.slice(0, OBJ_CAP).join('; ')}.`
    : "";
  const objectionHandling = `### OBJECTION HANDLING\nHandle pushback with judgment, not a script: (1) acknowledge the concern warmly, (2) address it in one line using a relevant fact or benefit from your context, (3) steer back toward ${primaryGoal}. Keep it to 1-2 sentences, never argue, and respect a firm "no" by closing politely.${knownConcerns}`;

  // FINAL UNIFIED ASSEMBLY IN IDEAL PARSING ORDER (1 -> 11)
  // NOTE: tool *definitions* are intentionally absent — they are registered with the
  // platform from ToolPlanner (see draft.suggestedFunctions -> PlatformAdapter).
  // The prompt only carries usage, inline per state under "Required Tool Actions".
  const sections = [
    identity,
    languageHandling,
    outputMechanics,
    scopeAndRefusals,
    safetyOverrides,
    businessContext,
    escalationAndRouting,
    dynamicVariables,
    flow,
    knowledge,
    objectionHandling
  ].filter(s => Boolean(s && s.trim().length > 0));

  return sections.join('\n\n---\n\n');
}

export class PromptAssembler {
  assemble(specOrIr: any, draft?: any): string {
    logger.debug("PromptAssembler.assemble()", { isSpec: !!(specOrIr && specOrIr.meta && specOrIr.businessSnapshot) });
    if (specOrIr && specOrIr.meta && specOrIr.businessSnapshot) {
      return assembleUnifiedPrompt(specOrIr as BusinessSpecification, draft);
    }
    logger.warn("PromptAssembler: legacy fallback branch triggered in assemble()");
    // Convert legacy IR/draft to BusinessSpecification format deterministically
    const meta = specOrIr?.meta || draft?.business || {};
    const existingSnap = specOrIr?.businessSnapshot || draft?.businessSnapshot || {};
    const existingPolicies = existingSnap?.policies || {};
    const spec: BusinessSpecification = {
      meta: {
        companyName: meta.companyName || meta.businessName || "Enterprise Client",
        agentName: meta.agentName || "Voice Assistant",
        industry: meta.industry || "General",
        isRegulated: false,
        toneProfile: meta.toneProfile || ["Professional"],
        primaryGoal: meta.role || meta.description || draft?.primaryGoal || "Assist callers",
        languageMode: meta.languageMode || draft?.languageMode || "english"
      },
      businessSnapshot: {
        operatingHours: existingSnap?.operatingHours || "Standard Business Hours",
        servicesOffered: existingSnap?.servicesOffered || [],
        policies: {
          cancellation: existingPolicies?.cancellation || "None — not specified",
          refunds: existingPolicies?.refunds || "None — not specified",
          escalationNumbers: existingPolicies?.escalationNumbers || []
        }
      },
      callFlowPlan: {
        steps: (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : (Array.isArray(specOrIr?.states) ? specOrIr.states : [])).map((s: any, idx: number) => ({
          sequenceOrder: s?.sequenceOrder || idx + 1,
          stateId: s?.stateId || `step_${idx + 1}`,
          stateName: s?.stateName || s?.label || `Step ${idx + 1}`,
          scriptDirective: s?.scriptDirective || s?.explicitDialogueScript || (s?.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`),
          slotsToCollect: Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : [],
          branchingConditions: Array.isArray(s?.branchingConditions) ? s.branchingConditions : [],
          fallbackBehavior: s?.fallbackBehavior || "",
          maxRetries: s?.maxRetries || 3,
          onFailure: s?.onFailure,
          confirmationRequired: s?.confirmationRequired,
          digressionAllowed: s?.digressionAllowed
        }))
      },
      knowledgeBase: {
        faqs: Array.isArray(draft?.faqCards) ? draft.faqCards : [],
        objections: (Array.isArray(draft?.objectionCards) ? draft.objectionCards : []).map((o: any) => ({ trigger: o?.trigger || o?.objection || "", response: o?.response || o?.handling || "" }))
      },
      tools: Array.isArray(specOrIr?.tools) ? specOrIr.tools : [],
      extractedEntities: specOrIr?.extractedEntities || draft?.extractedEntities,
      resolvedTopics: specOrIr?.resolvedTopics || draft?.resolvedTopics,
      capturedTopics: specOrIr?.capturedTopics || draft?.capturedTopics
    };
    return assembleUnifiedPrompt(spec, draft);
  }
}
