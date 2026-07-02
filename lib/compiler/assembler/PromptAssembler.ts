import { BusinessSpecification } from "@/lib/llm/types";

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

  const primaryGoal = spec?.meta?.primaryGoal || draft?.primaryGoal || "Assist callers";
  const faqQuestionsSet = new Set(
    specFaqs.map(f => String((f as any)?.question || (f as any)?.q || '').toLowerCase().trim()).filter(Boolean)
  );
  const faqs = [
    ...specFaqs,
    ...draftFaqs.filter((f: any) => {
      const q = String(f?.question || f?.q || '').toLowerCase().trim();
      return q && !faqQuestionsSet.has(q);
    })
  ];

  const specObjs = Array.isArray(spec?.knowledgeBase?.objections) ? spec.knowledgeBase.objections : [];
  const draftObjs = Array.isArray(draft?.objectionCards) ? draft.objectionCards : [];
  const objTriggersSet = new Set(
    specObjs.map(o => String((o as any)?.trigger || (o as any)?.objection || '').toLowerCase().trim()).filter(Boolean)
  );
  const draftObjsMapped = draftObjs.map((o: any) => ({
    trigger: o?.trigger || o?.objection || "",
    response: o?.response || o?.handling || ""
  }));
  const specObjsMapped = specObjs.map((o: any) => ({
    trigger: o?.trigger || o?.objection || "",
    response: o?.response || o?.handling || ""
  }));
  const objections = [
    ...specObjsMapped,
    ...draftObjsMapped.filter((o: any) => {
      const t = String(o?.trigger || '').toLowerCase().trim();
      return t && !objTriggersSet.has(t);
    })
  ];

  const rawSteps = (Array.isArray(spec?.callFlowPlan?.steps) && spec!.callFlowPlan!.steps.length > 0)
    ? spec!.callFlowPlan!.steps
    : (Array.isArray(draft?.callFlowSteps) ? draft.callFlowSteps : []);
  const steps = rawSteps.map((s: any, idx: number) => ({
    sequenceOrder: s?.sequenceOrder || idx + 1,
    stateId: s?.stateId || `step_${idx + 1}`,
    stateName: s?.stateName || s?.label || `Step ${idx + 1}`,
    scriptDirective: s?.scriptDirective || s?.explicitDialogueScript || (s?.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`),
    slotsToCollect: Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : (Array.isArray(s?.collectsVariable) ? s.collectsVariable : [])
  }));

  // 1. IDENTITY & PERSONA
  const toneList = Array.isArray(spec?.meta?.toneProfile) ? spec.meta.toneProfile : [String(spec?.meta?.toneProfile || "Professional")];
  const identity = `### AGENT IDENTITY & PERSONA
You are a voice AI agent for phone conversations representing ${spec?.meta?.companyName || "the company"}. Your output will be sent to a Text to Speech service for synthesising, respond in a speech-friendly manner.
- Name: ${spec?.meta?.agentName || "Agent"}
- Company: ${spec?.meta?.companyName || "Company"}
- Primary Goal: ${primaryGoal}
- Tone Profile: ${toneList.join(', ')}
- AI Identity Disclosure: Always state clearly that you are an AI assistant representing ${spec?.meta?.companyName || "the company"} when asked.`.trim();

  // 2. OUTPUT / VOICE MECHANICS
  const outputMechanics = `### OUTPUT & VOICE MECHANICS
VOICE RULES
- Use phone-friendly language only.
- Keep 1–2 short sentences per turn.
- Ask one question at a time.
- Avoid long explanations or verbal lists.
- Use natural acknowledgements only, like "okay", "got it", "understood".
- Never end mid-sentence.

EMAIL & NUMBER SPEAKABILITY RULES (MANDATORY)
- Whenever you mention an email address, output it in speakable form for TTS.
- Never output raw email symbols like "@" or "." in final spoken responses.
- Replace "@" with " at ".
- Replace "." with " dot ".
- In the local part (before @):
  - Speak digits individually (example: 1512 -> one five one two).
  - "." -> dot, "_" -> underscore, "-" -> dash, "+" -> plus.
- For letters:
  - Speak normal words as words.
  - Speak isolated letters one by one.
  - Use "zed" for letter "z" when spelling letters individually.
- In the domain:
  - Common words like gmail, yahoo, outlook stay as words.
  - Very short labels like "inc" should be spelled letter by letter (i n c).
- TLD rule (last part after final dot):
  - If it is "com", speak "com".
  - Otherwise spell letter-by-letter (ai -> a i, in -> i n, net -> n e t, org -> o r g).

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
  const emergencyTriggers = Array.isArray(draft?.guardrails?.emergencyTriggers) && draft.guardrails.emergencyTriggers.length > 0
    ? draft.guardrails.emergencyTriggers
    : ["medical emergency", "self-harm", "harm to others", "police/fire/ambulance request"];
  const emergencyAction = draft?.guardrails?.emergencyAction || "Stop the current flow immediately. Advise the caller to contact 911 or local emergency services right away, and immediately terminate the call.";
  const safetyOverrides = `### MANDATORY EMERGENCY & SAFETY OVERRIDES
Check this on every turn regardless of state.
If the caller mentions any safety-critical situations or emergencies (including: ${emergencyTriggers.join(', ')}):
- ${emergencyAction}`.trim();

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
  const allSlots = Array.from(new Set<string>(steps.flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : []))).filter(Boolean);
  const dynamicVariables = allSlots.length > 0
    ? `### DYNAMIC VARIABLES\nThe following variables must be collected and tracked during the call flow:\n${allSlots.map((slot: string) => `${slot}: {{${slot}}}`).join('\n')}`
    : "";

  // 8. CALL FLOW / STATE MACHINE
  const flowContent = steps.length > 0
    ? steps.map((step: any) => `STATE: [${step?.stateId}] (${step?.stateName})\nDirective: ${step?.scriptDirective}\nRequired Extractions: ${(Array.isArray(step?.slotsToCollect) ? step.slotsToCollect : []).map((slot: string) => `{{${slot}}}`).join(', ')}`).join('\n\n')
    : "No structured call flow defined. Engage conversationally based on primary goal.";
  const flow = `### CALL FLOW\n${flowContent}`;

  // 9. FAQS
  const faqSection = faqs.map((faq: any) => `Q: ${faq?.question || faq?.q || ''}\nA: ${faq?.answer || faq?.a || ''}`).join('\n\n') || "No specific FAQs defined.";
  const knowledge = `### FAQ (FREQUENTLY ASKED QUESTIONS)\nUse the following reference material opportunistically when asked:\n\n${faqSection}`;

  // 10. OBJECTION HANDLING
  const objSection = objections.map((obj: any) => `Trigger: ${obj?.trigger || obj?.objection || ''}\nHandling: ${obj?.response || obj?.handling || ''}`).join('\n\n') || "Address caller concerns calmly and re-route to main flow.";
  const objectionHandling = `### OBJECTION HANDLING\n${objSection}`;

  // 11. TOOL / FUNCTION SCHEMAS
  const toolsList = Array.isArray(spec?.tools) ? spec.tools : [];
  const tools = `### TOOL & FUNCTION EXECUTION\n${toolsList.length > 0 ? JSON.stringify(toolsList, null, 2) : "No tools defined."}`;

  // FINAL UNIFIED ASSEMBLY IN IDEAL PARSING ORDER (1 -> 11)
  const sections = [
    identity,
    outputMechanics,
    scopeAndRefusals,
    safetyOverrides,
    businessContext,
    escalationAndRouting,
    dynamicVariables,
    flow,
    knowledge,
    objectionHandling,
    tools
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
        primaryGoal: meta.role || meta.description || draft?.primaryGoal || "Assist callers"
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
          slotsToCollect: Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : []
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
