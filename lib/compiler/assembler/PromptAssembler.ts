import { BusinessSpecification } from "@/lib/llm/types";
import { resolveSlotDigitSpec } from "@/lib/compiler/constants/slotRegistry";

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

export function getSemanticCore(slot: string): string {
  if (!slot) return '';
  return slot.trim().toLowerCase()
    .replace(/^(preferred|caller|user|customer|client|primary|app|selected|expected|target|desired|requested)_+/i, '')
    .replace(/_+(preference|time|date|number|id|info|details)$/i, (match, p1) => `_${p1}`)
    .replace(/_+/g, '_');
}

export function semanticDedupSlots(slots: string[]): string[] {
  const uniqueList: string[] = [];
  const seenCores = new Set<string>();

  const sorted = [...slots].sort((a, b) => {
    const aCore = getSemanticCore(a);
    const bCore = getSemanticCore(b);
    return a.length - b.length;
  });

  for (const rawSlot of sorted) {
    if (!rawSlot) continue;
    const core = getSemanticCore(rawSlot);
    let isDuplicate = false;
    for (const existingCore of seenCores) {
      if (existingCore === core || core.endsWith(`_${existingCore}`) || existingCore.endsWith(`_${core}`)) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      seenCores.add(core);
      uniqueList.push(rawSlot);
    }
  }
  return uniqueList;
}

function buildDefaultSafetySection(customRules?: string, spec?: BusinessSpecification, draft?: any): string {
  const langMode = spec?.meta?.languageMode || draft?.languageMode || 'english';
  const draftVars: any[] = Array.isArray(draft?.dynamicVariables) ? draft.dynamicVariables : [];
  const countryCodeVar = draftVars.find(v => /country|region/i.test(v?.key || ''))?.defaultValue || '';
  const isIndiaOrHindi = langMode === 'hindi' || langMode === 'hinglish' || langMode === 'multilingual' || /india|\+91|ist/i.test(`${countryCodeVar} ${JSON.stringify(spec?.businessSnapshot || {})} ${spec?.meta?.companyName || ''}`);

  const emergencyText = isIndiaOrHindi
    ? `- Always direct the user to appropriate emergency resources as configured for the deployment region: call 112 for immediate physical danger/emergency services in India, or the KIRAN Mental Health Helpline (1800-599-0019) for psychological distress and crisis support.`
    : `- Always direct the user to appropriate emergency resources as configured for the deployment region (e.g., call 911 for immediate danger in the US, or the 988 Suicide & Crisis Lifeline for suicide/crisis situations).`;

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

function buildRuntimeToolsSection(tools?: any[]): string {
  const effectiveTools = (tools && tools.length > 0) ? tools : [
    { name: "validate_digit_input" },
    { name: "set_capture_mode" },
    { name: "end_call" },
    { name: "format_email_for_voice" }
  ];

  const hasValidateDigits = effectiveTools.some(t => t?.name === "validate_digit_input");
  const hasSetCaptureMode = effectiveTools.some(t => t?.name === "set_capture_mode");
  const hasEndCall = effectiveTools.some(t => t?.name === "end_call");
  const emailTool = effectiveTools.find(t => t?.name?.startsWith("format_email_")) || { name: "format_email_for_voice" };

  const lines: string[] = [];
  lines.push("### TELEPHONY RUNTIME TOOLS & EXECUTION PROTOCOL");
  lines.push("The audio runner environment exposes deterministic global runtime tools for STT buffering, numeric/email verification, and call termination. You MUST invoke these tools whenever their trigger conditions are met:");

  if (hasSetCaptureMode) {
    lines.push(`\n1. BUFFER MANAGEMENT (\`set_capture_mode\`):
- Before prompting the caller for a multi-digit number (PIN, phone number, OTP) or an email address, invoke \`set_capture_mode(keep_buffer: true, mode: "digits"|"email", field: "field_name", expected_digits: N)\` in the SAME turn as your asking question.
- This ensures that if the caller starts speaking or entering digits while you are talking, the audio buffer is preserved.
- Once the field is collected and confirmed accurately, invoke \`set_capture_mode(keep_buffer: false)\` to return to normal conversation buffering.`);
  }

  if (hasValidateDigits) {
    lines.push(`\n2. NUMERIC & PIN-CODE VALIDATION (\`validate_digit_input\`):
- When collecting a phone number, pin code, or OTP, invoke \`validate_digit_input(field: "...", expected_digits: N, user_text: "...", previously_collected: "...")\`.
- If the tool returns partial status (\`is_valid: false\`), speak the prompt returned by the tool or ask the caller specifically for the remaining digits.
- Never manually count, guess, or concatenate digits in text without running them through \`validate_digit_input\`.`);
  }

  if (emailTool) {
    lines.push(`\n3. EMAIL NORMALIZATION (\`${emailTool.name}\`):
- When an email address is uttered or spelled by the caller, invoke \`${emailTool.name}(email_text: "...")\`.
- Read back the \`spoken_email\` output string verbatim to the user for confirmation. Do not try to manually insert dot/at speech spacing.`);
  }

  if (hasEndCall) {
    lines.push(`\n4. CALL TERMINATION (\`end_call\`):
- When the conversation reaches a natural conclusion, refusal limit, or explicit hangup request, invoke \`end_call(reason: "...")\`.
- Call \`end_call\` synchronously in the exact same turn where you utter your final closing sentence. Never use text tokens like [HANGUP] or [END_CALL].`);
  }

  const domainTools = effectiveTools.filter(t => t?.name && !["validate_digit_input", "set_capture_mode", "end_call", "format_email_for_voice", "format_email_for_voice_no_comma", "transfer_call"].includes(t.name));
  if (domainTools.length > 0) {
    lines.push(`\n5. DOMAIN-SPECIFIC BUSINESS TOOLS:
${domainTools.map(t => `- \`${t.name}\`: ${t.description || "Execute business action."}`).join('\n')}`);
  }

  return lines.join('\n');
}

export function assembleUnifiedPrompt(spec: BusinessSpecification, draft?: any): string {
  const specFaqs = Array.isArray(spec?.knowledgeBase?.faqs) ? spec.knowledgeBase.faqs : [];
  const draftFaqs = Array.isArray(draft?.faqCards) ? draft.faqCards : [];
  console.log("[PromptAssembler] assembleUnifiedPrompt() invoked.", {
    hasSpec: !!spec,
    specFaqsCount: specFaqs.length,
    draftFaqsCount: draftFaqs.length,
    specFaqsFull: specFaqs,
    draftFaqsFull: draftFaqs
  });

  const draftVars: any[] = Array.isArray(draft?.dynamicVariables) ? draft.dynamicVariables : [];
  const draftVarsMap = new Map<string, any>();
  draftVars.forEach(v => { if (v?.key) draftVarsMap.set(v.key, v); });

  const rawStepsForCheck = (Array.isArray(spec?.callFlowPlan?.steps) && spec!.callFlowPlan!.steps.length > 0)
    ? spec!.callFlowPlan!.steps
    : (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : []);
  const rawCollectedSlots = new Set<string>(
    rawStepsForCheck.flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : (Array.isArray(s?.collectsVariable) ? s.collectsVariable : []))
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
  const languageMode = spec?.meta?.languageMode || draft?.languageMode || 'english';
  const capturedText = JSON.stringify(spec?.capturedTopics || []) + JSON.stringify(spec?.resolvedTopics || []);
  const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish' || /hindi|hinglish/i.test(capturedText);

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
    let directive = s?.scriptDirective || s?.explicitDialogueScript || (s?.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`);
    if (isHindiOrHinglish) {
      directive = directive.replace(/\bho\b/g, 'हो').replace(/\bbaat\b/gi, 'बात').replace(/\bkar\b/gi, 'कर').replace(/\brahi\b/gi, 'रही').replace(/\bhoon\b/gi, 'हूँ').replace(/\bhain\b/gi, 'हैं');
    }
    if ((idx === 0 || s?.stateId === 'identity_gate') && nameInfieldKey) {
      if (/right contact today|account holder|right contact/i.test(directive)) {
        directive = directive.replace(/right contact today|account holder|right contact/gi, `{{${nameInfieldKey}}}`);
      } else if (/सही नंबर पर|सही व्यक्ति/i.test(directive)) {
        directive = directive.replace(/सही नंबर पर|सही व्यक्ति/gi, `{{${nameInfieldKey}}}`);
      }
    }
    const slotsToCollect = Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : (Array.isArray(s?.collectsVariable) ? s.collectsVariable : []);

    let requiredToolActions: string[] = [];
    slotsToCollect.forEach((slot: string) => {
      const specMatch = resolveSlotDigitSpec(slot);
      if (specMatch) {
        if (specMatch.mode === 'digits') {
          requiredToolActions.push(`- Before asking: Invoke \`set_capture_mode(keep_buffer: true, mode: "digits", field: "${slot}", expected_digits: ${specMatch.expectedDigits})\` in the SAME turn you ask for ${slot}.`);
          requiredToolActions.push(`- On response: Call \`validate_digit_input(field: "${slot}", expected_digits: ${specMatch.expectedDigits}, user_text: caller_utterance, previously_collected: all_digits_collected_so_far)\` to verify and accumulate digits. If \`is_valid: false\`, speak the prompt returned by the tool or ask specifically for remaining digits. Retry up to 3 times.`);
          requiredToolActions.push(`- On completion: Call \`set_capture_mode(keep_buffer: false)\` before proceeding to the next step.`);
        } else if (specMatch.mode === 'email') {
          const emailToolName = spec?.tools?.find((t: any) => t?.name?.startsWith("format_email_"))?.name || "format_email_for_voice";
          requiredToolActions.push(`- Before asking: Invoke \`set_capture_mode(keep_buffer: true, mode: "email", field: "${slot}")\` in the SAME turn you ask for ${slot}.`);
          requiredToolActions.push(`- On response: Call \`${emailToolName}(email_text: caller_utterance)\` and read back \`spoken_email\` exactly for confirmation.`);
          requiredToolActions.push(`- On completion: Call \`set_capture_mode(keep_buffer: false)\` before proceeding to the next step.`);
        }
      }
    });

    const isUnconditionalTerminal = s?.isTerminal === true || s?.stateId === "resolution" || s?.stateId === "closing" || s?.stateId === "end_call";
    const hasConditionalEndCall = Array.isArray(s?.branchingConditions) && s.branchingConditions.some((b: any) => b?.goToStep === 'end_call' || b?.action === 'end_call');

    if (isUnconditionalTerminal) {
      requiredToolActions.push(`- Call Termination: Invoke \`end_call(reason: "${s?.stateId === "resolution" ? "closing_complete" : "flow_terminal"}")\` synchronously in the exact same turn as your closing sentence.`);
    } else if (hasConditionalEndCall) {
      const termBranches = (s.branchingConditions as any[] || []).filter(b => b?.goToStep === 'end_call' || b?.action === 'end_call');
      termBranches.forEach(tb => {
        const reason = tb?.reason || tb?.condition || "flow_terminal";
        requiredToolActions.push(`- Conditional Call Termination: IF caller triggers condition "${tb?.condition}", speak your closing line and invoke \`end_call(reason: "${reason}")\` synchronously in that same turn.`);
      });
    } else if (Array.isArray(s?.invokesTools) && s.invokesTools.includes("end_call")) {
      requiredToolActions.push(`- Conditional Call Termination: If caller asks to disconnect or terminate during this step, speak your closing response and invoke \`end_call(reason: "flow_terminal")\` in that same turn.`);
    }

    if (Array.isArray(s?.invokesTools)) {
      s.invokesTools.forEach((tName: string) => {
        if (tName !== "set_capture_mode" && tName !== "validate_digit_input" && !tName.startsWith("format_email_") && tName !== "end_call") {
          requiredToolActions.push(`- Domain Tool: Invoke \`${tName}()\` when condition for ${s?.stateId || "this step"} is met.`);
        }
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
  const identity = `### AGENT IDENTITY & PERSONA
You are a voice AI agent for phone conversations representing ${spec?.meta?.companyName || "the company"}. Your output will be sent to a Text to Speech service for synthesising, respond in a speech-friendly manner.
- Name: ${spec?.meta?.agentName || "Agent"}
- Company: ${spec?.meta?.companyName || "Company"}
- Call Direction: ${isInbound ? "INBOUND (Customer calling into the business/helpline)" : "OUTBOUND (Agent calling out to the customer/lead)"}
- Primary Goal: ${primaryGoal}
- Tone Profile: ${toneList.join(', ')}
- AI Identity Disclosure: Always state clearly upfront when ${isInbound ? "answering the call that you are an AI assistant for " + (spec?.meta?.companyName || "the company") + " (e.g., 'Thank you for calling " + (spec?.meta?.companyName || "the company") + ", I am " + (spec?.meta?.agentName || "Agent") + ", your AI voice assistant...')" : "initiating the call that you are an AI assistant calling on behalf of " + (spec?.meta?.companyName || "the company") + " before verifying the contact's identity"}. Never conceal your AI status if asked.`.trim();

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
- Detect the caller's language from their first 1-2 utterances.
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

${speakabilityContent}

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
  const prohibitionsList = Array.isArray(draft?.guardrails?.prohibitions) ? draft.guardrails.prohibitions : [];
  const customProhibitions = prohibitionsList.length > 0
    ? '\n' + prohibitionsList.map((p: any) => `- ${String(p)}`).join('\n')
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

OFF-TOPIC REFUSAL PROTOCOL
- If the user asks anything unrelated (for example: food, cooking, recipes, weapons, bombs, hacking, personal advice, general knowledge), say one of the two based on the context: “I might be missing something, how does this relate to what we’re discussing.” or "I might be missing something, can you please repeat yourself?"
- If the user repeats or persists with off-topic or refused requests more than two times, politely end the call.`.trim();

  // 4. SAFETY-CRITICAL OVERRIDES
  const safetyOverrides = buildDefaultSafetySection(guardrailsContent);

  // 5. BUSINESS CONTEXT & STATIC FACTS
  const servicesList = Array.isArray(spec?.businessSnapshot?.servicesOffered) ? spec.businessSnapshot.servicesOffered : [];
  const capturedTopics = Array.isArray(spec?.capturedTopics) ? spec.capturedTopics : [];
  const contextLines = [
    ...servicesList.map(s => `- Offered Service: ${String(s)}`),
    `- Operating Hours: ${formatOperatingHours(spec?.businessSnapshot?.operatingHours)}`,
    `- Cancellation Policy: ${formatPolicyString(spec?.businessSnapshot?.policies?.cancellation, "Standard cancellation policy applies.")}`,
    `- Refund Policy: ${formatPolicyString(spec?.businessSnapshot?.policies?.refunds, "Standard refund policy applies.")}`
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
    steps.flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : [])
  );

  const allSlots = Array.from(new Set<string>([
    ...Array.from(stepCollectedSlots),
    ...draftVars.map(v => v.key)
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
  const outfields: string[] = [];

  const dedupedSlots = semanticDedupSlots(allSlots);

  dedupedSlots.forEach(slot => {
    const v = draftVarsMap.get(slot);
    if (!isOutfield(slot)) {
      infields.push(`{{${slot}}}${v?.label && v.label !== slot ? ` — ${v.label}` : ''}`);
    } else {
      outfields.push(`[${slot}]${v?.label && v.label !== slot ? ` — ${v.label}` : ''}`);
    }
  });

  let dynamicVariables = "";
  if (infields.length > 0 || outfields.length > 0) {
    const sectionsList: string[] = [];
    if (infields.length > 0) {
      const infieldNames = allSlots.filter(s => !isOutfield(s));
      sectionsList.push(`#### INFIELDS (Pre-Call Context)\nThe following variables are provided dynamically from CRM/API before the call begins. You MUST actively reference and apply them in your behavior:\n${infields.join('\n')}\n\n- **Infield Usage Instructions**: Always personalize your dialogue using any caller profile data present (e.g., {{first_name}}). If regional or operational variables are present (such as ${infieldNames.map(n => `{{${n}}}`).join(', ')}), use them to tailor your timing, language selection, or scheduling logic during the conversation.`);
    }
    if (outfields.length > 0) {
      sectionsList.push(`#### OUTFIELDS (Post-Call Extraction)\nThe following details must be extracted from the conversation transcript. Mark them using [variable_name] syntax:\n${outfields.join('\n')}`);
    }
    dynamicVariables = `### DYNAMIC VARIABLES\n\n${sectionsList.join('\n\n')}`;
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
    ? `#### CONVERSATIONAL & CALL FLOW POLICIES\n${callFlowPolicies.join('\n')}\n\n#### STATE MACHINE STEPS\n`
    : "";

  const flowContent = steps.length > 0
    ? steps.map((step: any) => {
        const slots = Array.isArray(step?.slotsToCollect) ? step.slotsToCollect : [];
        const branches = Array.isArray(step?.branchingConditions) ? step.branchingConditions : [];
        const branchText = branches.length > 0
          ? branches.map((b: any) => `  * If ${b.condition} -> ${b.goToStep === 'end_call' || b.action === 'end_call' ? `Trigger end_call(reason: "${b.reason || 'completed'}")` : b.goToStep === 'transfer' || b.action === 'transfer' ? 'Trigger transfer_call()' : `Go to Step ${b.goToStep}`}`).join('\n')
          : `  * On completion / confirmation -> Go to Step ${step.sequenceOrder + 1}`;

        const lines: string[] = [];
        lines.push(`STATE: [${step?.stateId}] (${step?.stateName})`);
        lines.push(`* **Objective:** ${step?.objective || step?.stateName || `Execute step ${step?.sequenceOrder || step?.stateId}`}`);
        if (slots.length > 0) {
          lines.push(`* **Required Extractions:** ${slots.map((s: string) => `[${s}]`).join(', ')}`);
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

  // 9. FAQS
  const faqSection = faqs.map((faq: any) => `Q: ${faq?.question || faq?.q || ''}\nA: ${faq?.answer || faq?.a || ''}`).join('\n\n') || "No specific FAQs defined.";
  const knowledge = `### FAQ (FREQUENTLY ASKED QUESTIONS)\nUse the following reference material opportunistically when asked:\n\n${faqSection}`;

  // 10. OBJECTION HANDLING
  const objSection = objections.map((obj: any) => `Trigger: ${obj?.trigger || obj?.objection || ''}\nHandling: ${obj?.response || obj?.handling || ''}`).join('\n\n') || "Address caller concerns calmly and re-route to main flow.";
  const objectionHandling = `### OBJECTION HANDLING\n${objSection}`;

  // FINAL UNIFIED ASSEMBLY IN IDEAL PARSING ORDER (1 -> 11)
  const runtimeToolsProtocol = buildRuntimeToolsSection(spec?.tools);

  const sections = [
    identity,
    languageHandling,
    outputMechanics,
    runtimeToolsProtocol,
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
    console.log("[PromptAssembler] assemble() invoked.", {
      specOrIrIsSpec: !!(specOrIr && specOrIr.meta && specOrIr.businessSnapshot),
      draftKeys: draft ? Object.keys(draft) : null
    });
    if (specOrIr && specOrIr.meta && specOrIr.businessSnapshot) {
      return assembleUnifiedPrompt(specOrIr as BusinessSpecification, draft);
    }
    console.warn("[PromptAssembler] Legacy fallback branch triggered in assemble()", {
      hadMeta: !!specOrIr?.meta,
      hadBusinessSnapshot: !!specOrIr?.businessSnapshot
    });
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
          cancellation: existingPolicies?.cancellation || "Standard cancellation policy applies.",
          refunds: existingPolicies?.refunds || "Standard refund policy applies.",
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
