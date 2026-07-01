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
  console.log("[PromptAssembler] assembleUnifiedPrompt() invoked.", {
    hasSpec: !!spec,
    specFaqsCount: spec?.knowledgeBase?.faqs?.length || 0,
    draftFaqsCount: draft?.faqCards?.length || 0,
    specFaqsFull: spec?.knowledgeBase?.faqs || [],
    draftFaqsFull: draft?.faqCards || []
  });

  const primaryGoal = spec?.meta?.primaryGoal || draft?.primaryGoal || "Assist callers";
  const faqQuestionsSet = new Set((spec?.knowledgeBase?.faqs || []).map(f => f.question.toLowerCase().trim()));
  const faqs = [
    ...(spec?.knowledgeBase?.faqs || []),
    ...(draft?.faqCards || []).filter((f: any) => f?.question && !faqQuestionsSet.has(f.question.toLowerCase().trim()))
  ];

  const objTriggersSet = new Set((spec?.knowledgeBase?.objections || []).map(o => o.trigger.toLowerCase().trim()));
  const draftObjsMapped = (draft?.objectionCards || []).map((o: any) => ({
    trigger: o.trigger || o.objection || "",
    response: o.response || o.handling || ""
  }));
  const objections = [
    ...(spec?.knowledgeBase?.objections || []),
    ...draftObjsMapped.filter((o: any) => o?.trigger && !objTriggersSet.has(o.trigger.toLowerCase().trim()))
  ];
  const steps = (spec?.callFlowPlan?.steps && spec.callFlowPlan.steps.length > 0)
    ? spec.callFlowPlan.steps
    : (draft?.callFlowSteps || []).map((s: any, idx: number) => ({
        sequenceOrder: s.sequenceOrder || idx + 1,
        stateId: s.stateId || `step_${idx + 1}`,
        stateName: s.stateName || s.label || `Step ${idx + 1}`,
        scriptDirective: s.scriptDirective || s.explicitDialogueScript || (s.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`),
        slotsToCollect: s.slotsToCollect || []
      }));

  // 1. EXACT STATIC SYSTEM PROMPT WRAPPER
  const customProhibitions = draft?.guardrails?.prohibitions
    ? '\n' + draft.guardrails.prohibitions.map((p: string) => `- ${p}`).join('\n')
    : "";

  const staticSystemPrompt = `You are a voice AI agent for phone conversations. Your output will be sent to a Text to Speech service for synthesising, respond in a speech-friendly manner.

CORE SCOPE (MANDATORY)
- You have one task only, defined by the current agent objective.
- You must never respond to requests outside that task.
- If a request is unrelated, unsafe, or out of context, politely refuse and return to the task.
- Do not provide advice, explanations, recipes, instructions, opinions, or help of any kind beyond your task.
- Do not invent information, assume intent, or expand scope.

VOICE RULES
- Use phone-friendly language only.
- Keep 1–2 short sentences per turn.
- Ask one question at a time.
- Avoid long explanations or verbal lists.
- Use natural acknowledgements only, like "okay", "got it", "understood".

EMAIL SPEAKABILITY RULES (MANDATORY)
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
- When resuming after an audio check, briefly re-anchor the user: "Great, so as I was saying..." and resume from where you left off.

OFF-TOPIC HANDLING (MANDATORY)
- If the user asks anything unrelated (for example: food, cooking, recipes, weapons, bombs, hacking, personal advice, general knowledge): Say one of the two based on the context: “I might be missing something, how does this relate to what we’re discussing.” or "I might be missing something, can you please repeat yourself?"
- If the user repeats or persists more than two times, gracefully end the call.

SAFETY & HALLUCINATION GUARDRAILS
- Use only information explicitly provided in the prompt or conversation.
- If you don’t know something, say: “I don’t have that information.”
- Never explain restricted or unsafe topics.
- Never redirect to alternative topics or suggestions.${customProhibitions}

FLOW CONTROL
- Stay on the current objective only.
- Do not jump ahead or revisit earlier points unnecessarily.
- Do not repeat questions unless clarification is required.
- If required information is missing, ask one clear, specific question.

ENDING RULE
- Never end mid-sentence.
- If the user refuses or goes off-topic more than twice, politely end the call.`.trim();

  // 2. DYNAMIC SYSTEM PROMPT DETAILS (ADDED WITHOUT REMOVAL OF DETAILS)
  const identity = `### AGENT IDENTITY & PRIMARY GOAL\n- Name: ${spec?.meta?.agentName || "Agent"}\n- Company: ${spec?.meta?.companyName || "Company"}\n- Primary Goal: ${primaryGoal}\n- Tone Profile: ${(spec?.meta?.toneProfile || []).join(', ')}\n- AI Identity Disclosure: Always state clearly that you are an AI assistant representing ${spec?.meta?.companyName || "the company"} when asked.`;
  
  const context = `### BUSINESS CONTEXT & VARIABLES\n${(spec?.businessSnapshot?.servicesOffered || []).map(s => `- Offered Service: ${s}`).join('\n')}\n- Operating Hours: ${formatOperatingHours(spec?.businessSnapshot?.operatingHours)}\n- Cancellation Policy: ${formatPolicyString(spec?.businessSnapshot?.policies?.cancellation, "Standard cancellation policy applies.")}\n- Refund Policy: ${formatPolicyString(spec?.businessSnapshot?.policies?.refunds, "Standard refund policy applies.")}\n- Escalation Numbers: ${(spec?.businessSnapshot?.policies?.escalationNumbers || []).join(', ') || "None on file."}`;
  
  const entities = spec?.extractedEntities;
  const transferLines = [
    ...(entities?.namedContacts || []).map((c: any) => `- ${c.label}: ${c.value}`),
    ...(entities?.departments || []).map((d: string) => `- Department: ${d}`)
  ];
  const transferSection = transferLines.length > 0
    ? `### HUMAN TRANSFER & DEPARTMENT ROUTING\n${transferLines.join('\n')}`
    : "";

  const allSlots = Array.from(new Set<string>(steps.flatMap((s: any) => s.slotsToCollect || [])));
  const variablesSection = allSlots.length > 0
    ? `### DYNAMIC VARIABLES\n${allSlots.map((slot: string) => `${slot}: {{${slot}}}`).join('\n')}`
    : "";

  const capturedTopics = spec?.capturedTopics || [];
  const operationalSection = capturedTopics.length > 0
    ? `### OPERATIONAL PROTOCOLS & CAPTURED TOPICS\n${capturedTopics.map((c: any) => `Topic: ${c.topic}\nProtocol: ${c.summary}`).join('\n\n')}`
    : "";

  const emergencyTriggers = draft?.guardrails?.emergencyTriggers || [];
  const emergencyAction = draft?.guardrails?.emergencyAction || "";
  const emergencyHandling = emergencyTriggers.length > 0
    ? `### EMERGENCY HANDLING\nIf the caller mentions any of the following: ${emergencyTriggers.join(', ')} — stop the current flow immediately.\n${emergencyAction}`
    : "";

  const flow = `### CALL FLOW\n${steps.map((step: any) => `STATE: [${step.stateId}] (${step.stateName})\nDirective: ${step.scriptDirective}\nRequired Extractions: ${(step.slotsToCollect || []).map((slot: string) => `{{${slot}}}`).join(', ')}`).join('\n\n')}`;
  
  const faqSection = faqs.map((faq: any) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n') || "No specific FAQs defined.";
  const knowledge = `### FREQUENTLY ASKED QUESTIONS\n${faqSection}`;
  
  const objSection = objections.map((obj: any) => `Trigger: ${obj.trigger}\nHandling: ${obj.response}`).join('\n\n') || "Address caller concerns calmly and re-route to main flow.";
  const objectionHandling = `### OBJECTION HANDLING\n${objSection}`;
  
  const tools = `### TOOL & FUNCTION EXECUTION\n${JSON.stringify(spec?.tools || [], null, 2)}`;

  // 3. FINAL UNIFIED ASSEMBLY
  const sections = [
    staticSystemPrompt,
    identity,
    context,
    transferSection,
    variablesSection,
    operationalSection,
    emergencyHandling,
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
        steps: (draft?.callFlowSteps || specOrIr?.states || []).map((s: any, idx: number) => ({
          sequenceOrder: s.sequenceOrder || idx + 1,
          stateId: s.stateId || `step_${idx + 1}`,
          stateName: s.stateName || s.label || `Step ${idx + 1}`,
          scriptDirective: s.scriptDirective || s.explicitDialogueScript || (s.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`),
          slotsToCollect: s.slotsToCollect || []
        }))
      },
      knowledgeBase: {
        faqs: draft?.faqCards || [],
        objections: (draft?.objectionCards || []).map((o: any) => ({ trigger: o.trigger || o.objection || "", response: o.response || o.handling || "" }))
      },
      tools: specOrIr?.tools || [],
      extractedEntities: specOrIr?.extractedEntities || draft?.extractedEntities,
      resolvedTopics: specOrIr?.resolvedTopics || draft?.resolvedTopics,
      capturedTopics: specOrIr?.capturedTopics || draft?.capturedTopics
    };
    return assembleUnifiedPrompt(spec, draft);
  }
}
