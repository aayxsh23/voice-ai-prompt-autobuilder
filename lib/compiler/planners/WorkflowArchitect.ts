import { BusinessSpecification } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { safeParseJson } from "@/lib/llm/types";
import { semanticDedupSlots, getSemanticCore } from "@/lib/compiler/assembler/PromptAssembler";
import { hindiVerbForms } from "@/lib/llm/language/LanguagePolicy";
import { isDerivedSlot } from "@/lib/compiler/constants/slotRegistry";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool } from "@/lib/compiler/constants/toolRegistry";
import { isInstructionLike, lintDialogueLine } from "@/lib/pipeline/dialogue/dialogueLint";
import { fewShotBlock } from "@/lib/llm/fewshot";
import { logger } from "@/lib/logger";

function buildNaturalReadback(slots: string[], isHindiOrHinglish: boolean): string {
  if (!slots || slots.length === 0) {
    return isHindiOrHinglish
      ? `Say: "धन्यवाद। क्या अब तक दी गई सारी जानकारी सही है?"`
      : `Say: "Thank you. Does everything sound correct so far?"`;
  }
  const placeholders = slots.map(s => `{{${s}}}`);
  let woven = "";
  if (placeholders.length === 1) {
    woven = placeholders[0];
  } else if (placeholders.length === 2) {
    woven = isHindiOrHinglish ? `${placeholders[0]} और ${placeholders[1]}` : `${placeholders[0]} along with ${placeholders[1]}`;
  } else {
    const last = placeholders[placeholders.length - 1];
    const initial = placeholders.slice(0, placeholders.length - 1).join(", ");
    woven = isHindiOrHinglish ? `${initial}, और ${last}` : `${initial}, and ${last}`;
  }
  return isHindiOrHinglish
    ? `Say: "धन्यवाद। एक बार पुष्टि कर लेते हैं: मैंने ${woven} नोट किया है। क्या यह सभी जानकारी सही है?"`
    : `Say: "Thank you. Just to make sure I have everything right: ${woven}. Does that all look correct?"`;
}

/**
 * Deterministic turn for a stage we have no specific handling for.
 *
 * Deliberately does NOT speak the stage label: "Warm context reminder" and "Offer
 * free consultation" are builder metadata, the same category as the instruction-as-
 * speech bug — a caller must never hear them. The label goes to behaviorDirective so
 * the agent (and the judge) still know what the stage is for.
 *
 * This is a last-resort fallback used when the planner LLM is unavailable; the LLM
 * path writes a real line for the stage.
 */
function buildGenericStageTurn(label: string, isHindiOrHinglish: boolean): {
  scriptDirective: string; behaviorDirective: string; fallbackBehavior: string;
} {
  return {
    scriptDirective: isHindiOrHinglish
      ? `Say: "एक बात आपसे कहना चाहती हूँ, क्या मैं बता सकती हूँ?"`
      : `Say: "There's something I'd like to run past you, if that's alright?"`,
    behaviorDirective: `Cover this stage of the call: ${label}. Do not say the stage name aloud.`,
    fallbackBehavior: isHindiOrHinglish
      ? `Say: "क्या हम आगे बढ़ सकते हैं?"`
      : `Say: "Would that be alright?"`,
  };
}

function buildIntentDrivenAsk(slot: string, isHindiOrHinglish: boolean, isRetry = false): string {
  const fName = slot.replace(/_/g, ' ');
  if (isRetry) {
    if (/date|day|time|when|schedule/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "ताकि हम आपके लिए सही समय तय कर सकें, कृपया बताएं आप किस दिन या समय बात करना चाहेंगे?"`
        : `Say: "Just to make sure we secure the exact right slot for you, what day and time would you prefer?"`;
    }
    if (/name/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "ताकि हम आपका रिकॉर्ड सही से अपडेट कर सकें, कृपया अपना शुभ नाम बताएं?"`
        : `Say: "So we have your details correctly on file, could you share your exact name?"`;
    }
    if (/phone|mobile|whatsapp|number/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "ताकि हम आपसे संपर्क कर सकें, कृपया अपना सही नंबर बताएं?"`
        : `Say: "So our team can reach you without issues, what is the best phone number to use?"`;
    }
    if (/email/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "ताकि हम आपको पुष्टि भेज सकें, कृपया अपना ईमेल पता बताएं?"`
        : `Say: "So we can send over the confirmation details, what is your best email address?"`;
    }
    return isHindiOrHinglish
      ? `Say: "ताकि हम आपकी पूरी मदद कर सकें, कृपया अपना ${fName} स्पष्ट रूप से बताएं?"`
      : `Say: "To make sure we assist you effectively, what is your ${fName}?"`;
  } else {
    if (/date|day|when|schedule/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "आप किस दिन या तारीख को आना पसंद करेंगे?"`
        : `Say: "Which day or date suits you best for this?"`;
    }
    if (/time/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "किस समय बात करना या आना आपके लिए सबसे सुविधाजनक रहेगा?"`
        : `Say: "What time of day works best for your schedule?"`;
    }
    if (/name/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "कृपया अपना शुभ नाम बताइएगा?"`
        : `Say: "And whom do I have the pleasure of speaking with?"`;
    }
    if (/phone|mobile|whatsapp|number/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "आपसे संपर्क करने के लिए आपका नंबर क्या है?"`
        : `Say: "What is the best contact number to reach you on?"`;
    }
    if (/email/i.test(slot)) {
      return isHindiOrHinglish
        ? `Say: "आपका ईमेल पता क्या है जहाँ हम विवरण भेज सकें?"`
        : `Say: "What email address should we send those details to?"`;
    }
    return isHindiOrHinglish
      ? `Say: "कृपया मुझे अपना ${fName} बताएं ताकि हम आगे बढ़ सकें।"`
      : `Say: "To help us proceed, what is your ${fName}?"`;
  }
}

export class WorkflowArchitect {
  public static async planWorkflow(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['callFlowPlan']['steps']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;
    const languageMode = meta.languageMode || (spec as any).languageMode || 'english';
    const capturedTopics = spec.capturedTopics || [];
    const resolvedTopics = spec.resolvedTopics || [];
    const requiredStages = (spec.callFlowPlan as any)?.requiredStages || (meta as any)?._requiredStages || [];
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish';
    const primaryGoal = meta.primaryGoal || meta.description || "Assist callers professionally";

    const toneListForTools = Array.isArray(meta.toneProfile) ? meta.toneProfile : [String(meta.toneProfile || "")];
    const registeredToolNames = Array.from(new Set<string>([
      ...SYSTEM_RUNTIME_TOOLS.map(t => t.name),
      getEmailTool(toneListForTools).name,
      ...(Array.isArray(spec.tools) ? spec.tools.map((t: any) => t?.name).filter(Boolean) : []),
    ]));

    const callDirection = (meta.callDirection || '').toLowerCase() || (
      /\b(inbound|customer support|helpline|receptionist|incoming|answer calls|handle queries|receive calls|support line)\b/i.test(`${primaryGoal} ${meta.agentName} ${meta.companyName}`) ? 'inbound' : 'outbound'
    );
    const isInbound = callDirection === 'inbound';

    const existingSlots = new Set<string>();
    if (Array.isArray(spec.callFlowPlan?.steps)) {
      spec.callFlowPlan.steps.forEach((s: any) => {
        if (Array.isArray(s.slotsToCollect)) s.slotsToCollect.forEach((slot: string) => existingSlots.add(slot));
      });
    }
    const allDynamicVars = Array.isArray((spec as any).dynamicVariables) ? (spec as any).dynamicVariables : [];
    const infieldsList = allDynamicVars.filter((v: any) => v && (v.fieldDirection === 'infield' || v.source === 'crm' || v.source === 'api'));
    const outfieldsList = allDynamicVars.filter((v: any) => v && v.key && v.fieldDirection !== 'infield' && v.source !== 'crm' && v.source !== 'api');
    semanticDedupSlots(outfieldsList.map((o: any) => o.key)).forEach((key: string) => existingSlots.add(key));
    for (const s of Array.from(existingSlots)) {
      if (isDerivedSlot(s)) existingSlots.delete(s);
    }

    const nameInfield = infieldsList.find((v: any) => /first_name|caller_name|name/i.test(v.key))?.key;
    const greetingContactString = nameInfield ? `{{${nameInfield}}}` : "the right contact today";
    const hindiContactString = nameInfield ? `{{${nameInfield}}}` : "सही नंबर पर";

    const companyStr = meta.companyName || (isHindiOrHinglish ? 'कंपनी' : 'our team');
    const agentStr = meta.agentName || (isHindiOrHinglish ? 'असिस्टेंट' : 'Agent');
    const agentGender: 'female' | 'male' = meta.agentGender === 'male' ? 'male' : 'female';
    const vf = hindiVerbForms(agentGender);
    const denyAiDisclosure = meta.aiDisclosure === 'deny';

    const step1 = {
      sequenceOrder: 1,
      stateId: "identity_gate",
      stateName: "Identity Gate & Greeting",
      objective: isInbound
        ? "Greet caller and establish identity / role clearly."
        : "Verify right contact and state reason for call.",
      scriptDirective: meta.openingPhrase
        ? (meta.openingPhrase.startsWith("Say:") ? meta.openingPhrase : `Say: "${meta.openingPhrase}"`)
        : (isInbound
          ? (isHindiOrHinglish
            ? (denyAiDisclosure
              ? `Say: "नमस्ते, ${companyStr} में कॉल करने के लिए धन्यवाद। मैं ${agentStr} बात कर ${vf.rahi} हूँ। आज मैं आपकी क्या सहायता कर ${vf.sakti} हूँ?"`
              : `Say: "नमस्ते, ${companyStr} में कॉल करने के लिए धन्यवाद। मैं ${agentStr}, आपकी AI voice assistant हूँ। आज मैं आपकी क्या सहायता कर ${vf.sakti} हूँ?"`)
            : (denyAiDisclosure
              ? `Say: "Thank you for calling ${companyStr}. My name is ${agentStr}. How can I help you today?"`
              : `Say: "Thank you for calling ${companyStr}. My name is ${agentStr}, your AI voice assistant. How can I help you today?"`))
          : (isHindiOrHinglish
            ? (denyAiDisclosure
              ? `Say: "नमस्ते, मैं ${companyStr} से ${agentStr} बात कर ${vf.rahi} हूँ। क्या मेरी बात ${hindiContactString} से हो रही है?"`
              : `Say: "नमस्ते, मैं ${companyStr} से ${agentStr}, एक AI voice assistant बात कर ${vf.rahi} हूँ। क्या मेरी बात ${hindiContactString} से हो रही है?"`)
            : (denyAiDisclosure
              ? `Say: "Hello, I'm ${agentStr} calling from ${companyStr}. Am I speaking with ${greetingContactString}?"`
              : `Say: "Hello, I'm ${agentStr}, an AI assistant calling on behalf of ${companyStr}. Am I speaking with ${greetingContactString}?"`))),
      slotsToCollect: [] as string[],
      branchingConditions: [
        { condition: "Identity verified / ready to proceed", goToStep: 2 },
        { condition: "Wrong number / caller busy", goToStep: "end_call", reason: "wrong_contact_or_busy" }
      ],
      // hindiVerbForms() returns forms already resolved for the agent's gender —
      // `sakti` IS "सकता" when male. There is no `sakta`/`raha` key, so using them
      // rendered "क्या मैं जान undefined हूँ" into the prompt.
      fallbackBehavior: isHindiOrHinglish
        ? `Say: "क्षमा करें, क्या मैं जान ${vf.sakti} हूँ कि मैं किससे बात कर ${vf.rahi} हूँ?"`
        : `Say: "Excuse me, may I verify whom I am speaking with?"`,
      maxRetries: 3,
      invokesTools: [] as string[],
      isFallback: true
    };

    const slotSteps: any[] = [];
    const slotsArray = Array.from(existingSlots).filter(Boolean);
    slotsArray.forEach((slot, idx) => {
      const stepNum = idx + 2;
      const formattedName = slot.replace(/_/g, ' ');
      slotSteps.push({
        sequenceOrder: stepNum,
        stateId: `capture_${slot.toLowerCase()}`,
        stateName: `Capture ${formattedName}`,
        objective: `Ask specifically for and capture: ${slot}`,
        scriptDirective: buildIntentDrivenAsk(slot, isHindiOrHinglish, false),
        slotsToCollect: [slot],
        branchingConditions: [
          { condition: `${formattedName} provided`, goToStep: stepNum + 1 },
          { condition: "Caller asks for callback", goToStep: "end_call", reason: "callback_requested" }
        ],
        fallbackBehavior: buildIntentDrivenAsk(slot, isHindiOrHinglish, true),
        maxRetries: 3,
        invokesTools: [],
        isFallback: true
      });
    });

    const nextSeqAfterSlots = 2 + slotSteps.length;
    const allCollectedSlots = slotsArray.length > 0 ? slotsArray : ["caller_intent"];

    const confirmStep = {
      sequenceOrder: nextSeqAfterSlots,
      stateId: "confirmation_readback",
      stateName: "Confirmation Read-Back",
      objective: "Read back and confirm all collected details before closing.",
      scriptDirective: buildNaturalReadback(allCollectedSlots, isHindiOrHinglish),
      slotsToCollect: [] as string[],
      branchingConditions: [
        { condition: "Caller confirms accuracy", goToStep: nextSeqAfterSlots + 1 },
        { condition: "Caller wants to modify details", goToStep: 2 }
      ],
      fallbackBehavior: isHindiOrHinglish ? `Say: "क्या बताई गई जानकारी सही है?"` : `Say: "Does everything sound correct so far?"`,
      maxRetries: 3,
      invokesTools: [] as string[],
      isFallback: true
    };

        const terminalBranches = (meta.terminalStates && Array.isArray(meta.terminalStates) && meta.terminalStates.length > 0)
      ? meta.terminalStates.map((ts: any) => ({
          condition: `Concluding call: ${ts.label || ts.stateId || 'completed'}`,
          goToStep: 'end_call',
          reason: ts.stateId || 'completed'
        }))
      : [{ condition: "Concluding call", goToStep: "end_call", reason: "completed" }];

    const terminalStep = {
      sequenceOrder: nextSeqAfterSlots + 1,
      stateId: "resolution",
      stateName: "Resolution & Terminal Close",
      objective: "Cleanly end the call after final confirmation.",
      scriptDirective: isHindiOrHinglish
        ? `Say: "बहुत धन्यवाद। हमारी टीम इस पर शीघ्र ही आगे की कार्रवाई करेगी। आपका दिन शुभ हो!"`
        : `Say: "Wonderful. Our team will review this and follow up shortly. Thank you for your time, and have a great day!"`,
      slotsToCollect: [] as string[],
      branchingConditions: terminalBranches,
      fallbackBehavior: isHindiOrHinglish ? `Say: "बात करने के लिए धन्यवाद, शुभ दिन!"` : `Say: "Thank you for speaking with me today, goodbye!"`,
      maxRetries: 1,
      invokesTools: ["end_call"],
      isFallback: true,
      isTerminal: true
    };

    let fallbackSteps = [step1, ...slotSteps, confirmStep, terminalStep];

    const genderDirective = isHindiOrHinglish
      ? `\nAGENT GENDER: The agent is ${agentGender}. Use ${agentGender === 'male' ? 'MASCULINE' : 'FEMININE'} verb inflections for the agent's own speech (e.g., "${agentGender === 'male' ? 'कर रहा हूँ, कर सकता हूँ' : 'कर रही हूँ, कर सकती हूँ'}"). Address the caller respectfully with "आप" and plural verbs.`
      : "";
    const disclosureDirective = denyAiDisclosure
      ? `\nAI DISCLOSURE (STRICT USER REQUIREMENT): DO NOT disclose or hint that the agent is an AI. The identity/greeting step must present the agent strictly as a human representative of the company; never say "AI assistant" or "AI voice assistant".${meta.openingPhrase ? ` Use exact openingPhrase verbatim: "${meta.openingPhrase}".` : ""}`
      : `\nAI DISCLOSURE: The identity/greeting step MUST proactively state that the agent is an AI assistant for the company.`;
    const langDirective = isHindiOrHinglish
      ? `\nCRITICAL LANGUAGE DIRECTIVE:\nThis voice agent communicates in Hindi/Hinglish (languageMode '${languageMode}'). EVERY SINGLE scriptDirective and fallbackBehavior across every step MUST be written in Devanagari script (देवनागरी), NOT Romanized English.\nENGLISH WORDS RULE: Any word originating from English (such as WhatsApp, registered, training, billing, software, demo, email, phone, callback, status, schedule, slot, reach, team, number, etc.) MUST remain in Roman/English script within the Devanagari sentence. NEVER transliterate English words into Devanagari. Example: "क्या आपका registered नंबर WhatsApp पर reach करने योग्य है?" NOT "क्या आपका रजिस्टर्ड नंबर व्हाट्सएप पर रीच करने योग्य है?"${genderDirective}${disclosureDirective}`
      : `${disclosureDirective}`;

    const styleExemplars = fewShotBlock({ policy: { mode: languageMode as any } });

    const prompt = `You are a WorkflowArchitect specializing in designing deterministic voice AI call flow state machines.
Given the following business goal, metadata, and operational topics, design a comprehensive, multi-step call flow state machine.${langDirective}

Primary Goal: ${primaryGoal}
Company Name: ${meta.companyName || "Unknown"}
Agent Name: ${meta.agentName || "Assistant"}
Language Mode: ${languageMode}
Call Direction: ${isInbound ? "INBOUND (Incoming customer call to helpline/reception)" : "OUTBOUND (Agent initiating call to user)"}

Business Snapshot:
${JSON.stringify(snap, null, 2)}

Operational Protocols & Topics to Handle:
${JSON.stringify(capturedTopics, null, 2)}
${resolvedTopics.length > 0 ? `\nResolved Topics:\n${JSON.stringify(resolvedTopics, null, 2)}` : ""}
${existingSlots.size > 0 ? `\nKnown Outfield Slots to Collect (MUST generate 1 step per slot):\n${JSON.stringify(Array.from(existingSlots))}` : ""}
${infieldsList.length > 0 ? `\nKnown Pre-Call CRM Infields (available before call starts):\n${JSON.stringify(infieldsList.map((v: any) => v.key))}` : ""}
${requiredStages.length > 0 ? `\nMANDATORY REQUIRED STAGES (Extract exact states matching this workflow outline sequentially): ${JSON.stringify(requiredStages)}` : ""}

MANDATORY STATE MACHINE DESIGN RULES:
1. ONE QUESTION PER TURN: Ask exactly ONE question or prompt in each step. Never stack multiple questions in a single turn.
2. DEDICATED SLOT STEPS: If multiple variables/outfields must be collected (e.g. fitness_goal, health_concerns, language_preference, callback_time), generate ONE dedicated state step for each slot! Never collect more than one slot in a single step. Attach slots to collect INSIDE the appropriate collection stage.
3. STAGE-DRIVEN FLOW: If MANDATORY REQUIRED STAGES are provided above, generate exactly one state per required stage in strict order.
4. CALL DIRECTION & PROACTIVE AI DISCLOSURE:
   - If Call Direction is INBOUND: ${denyAiDisclosure ? `Step 1 (identity_gate) MUST greet the caller warmly and ask how you can help, presenting strictly as a human representative (${meta.agentName || 'Agent'}). Do NOT mention AI or assistant.${meta.openingPhrase ? ` Use exact openingPhrase: "${meta.openingPhrase}".` : ""}` : `Step 1 (identity_gate) MUST greet the caller warmly, proactively state upfront that you are an AI assistant for ${meta.companyName || 'Company'}, and ask how you can help (e.g., "Thank you for calling ${meta.companyName || 'Company'}. I'm ${meta.agentName || 'Assistant'}, your AI voice assistant. How can I help you today?").`} Do NOT ask "Am I speaking with..." on inbound calls!
   - If Call Direction is OUTBOUND: ${denyAiDisclosure ? `Step 1 (identity_gate) MUST introduce yourself as a human representative (${meta.agentName || 'Agent'} from ${meta.companyName || 'Company'}) and verify the caller's identity. Do NOT mention AI.${meta.openingPhrase ? ` Use exact openingPhrase: "${meta.openingPhrase}".` : ""}` : `Step 1 (identity_gate) MUST state upfront that you are an AI assistant calling on behalf of ${meta.companyName || 'Company'}, and verify the caller's identity (using the pre-call name variable if available).`}
5. BRANCHING & ROUTING: Every step must include explicit 'branchingConditions' indicating transitions (e.g., if confirmed -> goToStep N; if busy/wrong number -> goToStep 'end_call'). Any state may branch on or tailor using pre-call infields (e.g., {{existing_segment}}).
6. READ-BACK CONFIRMATION: The step right before the final closing step MUST be a 'Confirmation Read-Back' step where the agent confirms all collected slots.
7. WIRE END_CALL ON TERMINAL STEPS: The final closing step and all terminal error/refusal branches MUST specify 'end_call' in their branching transition ('goToStep: "end_call"') OR in 'invokesTools: ["end_call"]'.
8. REGISTERED TOOLS ONLY: 'invokesTools' may ONLY contain names from this exact list: ${JSON.stringify(registeredToolNames)}. NEVER invent a tool — any name outside this list is discarded. If a human handoff is needed, express it as a branchingCondition routing to the escalation path, NOT as a tool.
9. SCOPE EXCLUSIONS & TERMINAL BRANCHES:
   ${meta.scopeExclusions && meta.scopeExclusions.length > 0 ? `- OUT OF SCOPE TOPICS (DO NOT generate steps or tools for these): ${JSON.stringify(meta.scopeExclusions)}` : ""}
   ${meta.terminalStates && meta.terminalStates.length > 0 ? `- TERMINAL CLOSING BRANCHES (Must generate dedicated terminal steps with end_call for each of these possible outcomes): ${JSON.stringify(meta.terminalStates)}` : ""}
10. STRICT 2-WORD VARIABLE & SLOT NAMING RULE: All variable keys, slot names in 'slotsToCollect', or custom fields MUST be under 2 words max (separated by single underscores, e.g. 'phone_number', 'booking_date', 'caller_name', 'first_name', 'order_id'). Names with 3 or more words like 'customer_phone_number', 'preferred_appointment_time', or 'current_day_current_date_current_time' are strictly forbidden and NOT allowed! Always use concise 1-2 word names.

### DIALOGUE STYLE CONTRACT (Strict Spoken Voice Standard)
1. ACKNOWLEDGE → BRIDGE → ONE ASK: Every turn must follow a natural conversational rhythm: first briefly acknowledge the caller's last response, bridge to the next topic, and conclude with exactly ONE clear ask.
2. USE CONTRACTIONS: Always use natural contractions (\`I'm\`, \`you're\`, \`we'll\`, \`can't\`, \`that's\`, \`let's\`) to sound warm and human. Never use stiff, robotic phrasing.
3. INTENT-DRIVEN ASKS: Tailor your questions naturally to the intent and context of the slot being collected. Never use formulaic templates like \`Could you please share your [field name]?\`.
4. NEVER NAME AN INTERNAL FIELD: Never speak internal variable names or technical slot keys aloud (\`booking_date\`, \`existing_segment\`, \`caller_name\`). Speak naturally about "the date that works best for you" or "your name".
5. NATURAL READBACK: When confirming multiple pieces of information, weave placeholders seamlessly into a spoken sentence (e.g., \`Got it, so that's {{booking_date}} with {{doctor_name}}. Does that work?\`). Never recite a bulleted list or \`key: value\` pairs.
6. REPHRASING RETRIES & REASON-WHY: For fallback or retry attempts (\`fallbackBehavior\`), never repeat the initial question verbatim. Rephrase the question using different wording and briefly explain the reason-why you need the information (e.g., \`I just want to make sure we book the exact right slot for you—what day would you prefer?\`).
${styleExemplars}

STYLE SEED & DIALOGUE GENERATION (Per-Business Custom Register):
Before designing the steps, adopt a tailored tone specifically for ${meta.companyName || "this business"} (${meta.industry || "General"}, Tone: ${Array.isArray(meta.toneProfile) ? meta.toneProfile.join(', ') : (meta.toneProfile || 'Professional')}). Write all scriptDirective and fallbackBehavior lines adhering strictly to this business's custom voice and the DIALOGUE STYLE CONTRACT above.

DENSITY: Keep every scriptDirective and fallbackBehavior to 1-2 short spoken sentences. No rationale or meta-commentary. State rules once; do not restate global policy inside steps.

Return a JSON array of step objects with sequenceOrder, stateId, stateName, objective, scriptDirective, slotsToCollect, branchingConditions, fallbackBehavior, maxRetries, and invokesTools.`;

    try {
      const userDefinedSteps = spec.callFlowPlan?.userDefinedSteps || [];
      const existingCustomSteps = (spec.callFlowPlan?.steps || []).filter((s: any) => !s.isFallback);
      if (userDefinedSteps.length > 0) {
        return WorkflowArchitect.postProcessSteps(userDefinedSteps, existingSlots, isInbound, meta, isHindiOrHinglish, requiredStages, infieldsList);
      }
      if (existingCustomSteps.length >= 2) {
        return WorkflowArchitect.postProcessSteps(existingCustomSteps, existingSlots, isInbound, meta, isHindiOrHinglish, requiredStages, infieldsList);
      }

      const response = await geminiClient.generate({
        systemInstruction: `You are a structured JSON workflow planning specialist. Return ONLY a valid JSON array of step objects.${isHindiOrHinglish ? " All Say: dialogue inside scriptDirective MUST be written in Devanagari script (देवनागरी). ENGLISH WORDS RULE: Any word originating from English (such as WhatsApp, registered, training, billing, software, demo, email, phone, callback, status, schedule, slot, reach, team, etc.) MUST remain in Roman/English script inside the Devanagari sentence. NEVER transliterate English words to Devanagari." : ""}`,
        prompt,
        responseMimeType: "application/json"
      });
      let parsed = safeParseJson(response.text, fallbackSteps);
      let steps = Array.isArray(parsed) && parsed.length >= 3 ? parsed : fallbackSteps;

      const hasHardFail = (stList: any[]) => stList.some((s: any) =>
        lintDialogueLine(s.scriptDirective || '').some(f => f.severity === 'critical' || f.severity === 'major') ||
        lintDialogueLine(s.fallbackBehavior || '').some(f => f.severity === 'critical' || f.severity === 'major')
      );

      if (Array.isArray(parsed) && parsed.length >= 3 && hasHardFail(parsed)) {
        logger.info("WorkflowArchitect generation encountered critical/major dialogueLint issues. Regenerating...");
        try {
          const retryResponse = await geminiClient.generate({
            systemInstruction: `You are a structured JSON workflow planning specialist. Return ONLY a valid JSON array of step objects. Ensure no internal field names appear in dialogue, ask exactly one question per turn, and never output builder instructions as spoken lines.`,
            prompt: prompt + `\n\nCRITICAL LINT FIX REQUIRED: Your previous attempt produced dialogue with structural lint errors (such as naming internal variables directly, stacking multiple questions in one turn, or putting builder instructions inside Say: ""). Regenerate the steps adhering strictly to natural spoken dialogue and the DIALOGUE STYLE CONTRACT.`,
            responseMimeType: "application/json"
          });
          const retryParsed = safeParseJson(retryResponse.text, steps);
          if (Array.isArray(retryParsed) && retryParsed.length >= 3 && !hasHardFail(retryParsed)) {
            steps = retryParsed;
          }
        } catch (retryErr) {
          logger.warn("WorkflowArchitect regeneration failed", retryErr);
        }
      }

      steps = WorkflowArchitect.postProcessSteps(steps, existingSlots, isInbound, meta, isHindiOrHinglish, requiredStages, infieldsList);
      return steps.length > 0 ? steps : fallbackSteps;
    } catch (err) {
      logger.warn("WorkflowArchitect fallback triggered", err);
      return WorkflowArchitect.postProcessSteps(fallbackSteps, existingSlots, isInbound, meta, isHindiOrHinglish, requiredStages, infieldsList);
    }
  }

  private static dedupeStatesByCanonicalId(steps: any[]): any[] {
    const canonical = (id: string) => (id || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const uniqueSteps: any[] = [];
    const seenCores = new Set<string>();

    for (const step of steps) {
      if (!step) continue;
      const idCore = canonical(step.stateId);
      
      let isDuplicate = false;
      let matchedCore = "";
      for (const existingCore of seenCores) {
        if (existingCore === idCore || idCore.endsWith(`_${existingCore}`) || existingCore.endsWith(`_${idCore}`)) {
          isDuplicate = true;
          matchedCore = existingCore;
          break;
        }
      }

      if (!isDuplicate) {
        seenCores.add(idCore);
        uniqueSteps.push({ ...step });
      } else {
        const survivor = uniqueSteps.find(s => {
           const sc = canonical(s.stateId);
           return sc === matchedCore || sc.endsWith(`_${matchedCore}`) || matchedCore.endsWith(`_${sc}`);
        });
        if (survivor && Array.isArray(step.slotsToCollect)) {
          const combined = new Set([...(survivor.slotsToCollect || []), ...step.slotsToCollect]);
          survivor.slotsToCollect = Array.from(combined);
        }
      }
    }
    return uniqueSteps;
  }

  private static ensureAdvisoryStages(steps: any[], requiredStages: any[], isHindiOrHinglish: boolean): any[] {
    // The LLM prompt now strictly enforces generating the required stages.
    // Blindly injecting missing stages with generic dialogue destroys the flow quality.
    // We trust the LLM's generated flow here.
    return steps;
  }

  private static orderFlow(steps: any[]): any[] {
    const opening: any[] = [];
    const middle: any[] = [];
    const confirm: any[] = [];
    const terminal: any[] = [];

    for (const step of steps) {
      const id = (step.stateId || '').toLowerCase();
      if (/identity|greet|open/i.test(id) && opening.length === 0) {
        opening.push(step);
      } else if (step.isTerminal || /terminal|end|close|resolut/i.test(id)) {
        terminal.push(step);
      } else if (/confirm|readback/i.test(id)) {
        confirm.push(step);
      } else {
        middle.push(step);
      }
    }

    const ordered = [...opening, ...middle, ...confirm, ...terminal];
    ordered.forEach((s, idx) => {
      s.sequenceOrder = idx + 1;
    });
    return ordered;
  }

  private static ensureDefaultRouting(steps: any[]): any[] {
    return steps.map((step, idx) => {
      const isLast = idx === steps.length - 1;
      const nextStep = isLast ? null : steps[idx + 1];
      
      let existingBranches = Array.isArray(step.branchingConditions) ? [...step.branchingConditions] : [];
      
      if (!step.isTerminal && !/terminal|end|close|resolut/i.test(step.stateId || '')) {
        // Only inject a fallback progression branch if the LLM generated NO branches to move forward
        const hasProgression = existingBranches.some(b => b.goToStep && b.goToStep !== 'end_call' && b.action !== 'end_call' && b.goToStep !== 'transfer');
        if (!hasProgression && nextStep) {
          if (step.slotsToCollect?.length > 0) {
             existingBranches.unshift({ condition: `Information provided`, goToStep: nextStep.stateId });
          } else {
             existingBranches.unshift({ condition: "Completed or agreed", goToStep: nextStep.stateId });
          }
        }
      } else {
        // Ensure terminal steps have an end_call branch
        if (!existingBranches.some(b => b.goToStep === 'end_call' || b.action === 'end_call')) {
          existingBranches.push({ condition: "Concluding call", goToStep: "end_call", reason: "completed" });
        }
      }
      
      step.branchingConditions = existingBranches;
      return step;
    });
  }

  private static postProcessSteps(
    steps: any[],
    expectedOutfields: Set<string>,
    isInbound: boolean,
    meta: any,
    isHindiOrHinglish: boolean,
    requiredStages: any[] = [],
    infieldsList: any[] = []
  ): any[] {
    const vf = hindiVerbForms(meta?.agentGender === 'male' ? 'male' : 'female');
    const denyAi = meta?.aiDisclosure === 'deny';

    // Stage 1: Normalize each step
    const normalized: any[] = [];
    steps.forEach((s: any, idx: number) => {
      const step = { ...s };

      if (idx === 0 || step.stateId === 'identity_gate') {
        let directive = step.scriptDirective || "";
        if (meta?.openingPhrase) {
          directive = meta.openingPhrase.startsWith("Say:") ? meta.openingPhrase : `Say: "${meta.openingPhrase}"`;
        } else {
          const hasDisclosure = /ai assistant|ai voice|ai असिस्टेंट/i.test(directive);
          if (!denyAi && !hasDisclosure) {
            if (isInbound) {
              directive = isHindiOrHinglish
                ? `Say: "नमस्ते, ${meta?.companyName || 'कंपनी'} में कॉल करने के लिए धन्यवाद। मैं ${meta?.agentName || 'असिस्टेंट'}, आपकी AI voice assistant हूँ। आज मैं आपकी क्या सहायता कर ${vf.sakti} हूँ?"`
                : `Say: "Thank you for calling ${meta?.companyName || 'our team'}. My name is ${meta?.agentName || 'Agent'}, your AI voice assistant. How can I help you today?"`;
            } else {
              const contactTarget = /{{[a-zA-Z0-9_]+}}/.exec(directive)?.[0] || (isHindiOrHinglish ? "सही नंबर पर" : "the right contact today");
              directive = isHindiOrHinglish
                ? `Say: "नमस्ते, मैं ${meta?.companyName || 'कंपनी'} से ${meta?.agentName || 'एजेंट'}, एक AI voice assistant बात कर ${vf.rahi} हूँ। क्या मेरी बात ${contactTarget} से हो रही है?"`
                : `Say: "Hello, I'm ${meta?.agentName || 'Agent'}, an AI assistant calling on behalf of ${meta?.companyName || 'our team'}. Am I speaking with ${contactTarget}?"`;
            }
          } else if (denyAi && (hasDisclosure || !directive)) {
            if (isInbound) {
              directive = isHindiOrHinglish
                ? `Say: "नमस्ते, ${meta?.companyName || 'कंपनी'} में कॉल करने के लिए धन्यवाद। मैं ${meta?.agentName || 'असिस्टेंट'} बात कर ${vf.rahi} हूँ। आज मैं आपकी क्या मदद कर ${vf.sakti} हूँ?"`
                : `Say: "Thank you for calling ${meta?.companyName || 'our team'}. My name is ${meta?.agentName || 'Agent'}. How can I help you today?"`;
            } else {
              const contactTarget = /{{[a-zA-Z0-9_]+}}/.exec(directive)?.[0] || (isHindiOrHinglish ? "सही नंबर पर" : "the right contact today");
              directive = isHindiOrHinglish
                ? `Say: "नमस्ते, मैं ${meta?.companyName || 'कंपनी'} से ${meta?.agentName || 'एजेंट'} बात कर ${vf.rahi} हूँ। क्या मेरी बात ${contactTarget} से हो रही है?"`
                : `Say: "Hello, I'm ${meta?.agentName || 'Agent'} calling from ${meta?.companyName || 'our team'}. Am I speaking with ${contactTarget}?"`;
            }
          }
        }
        step.scriptDirective = directive;
      }

      // Demotion guard
      let rawScript = step.scriptDirective || "";
      let justText = rawScript.replace(/^Say:\s*"?/i, '').replace(/"?$/g, '').trim();
      if (isInstructionLike(justText)) {
        step.behaviorDirective = step.behaviorDirective ? `${step.behaviorDirective} | ${justText}` : justText;
        step.scriptDirective = buildGenericStageTurn(step.stateName || step.stateId || "Step", isHindiOrHinglish).scriptDirective;
      }

      // Slot hygiene
      const rawSlots = Array.isArray(step.slotsToCollect) ? step.slotsToCollect : [];
      step.slotsToCollect = semanticDedupSlots(rawSlots.filter((slot: string) => !isDerivedSlot(slot)));

      normalized.push(step);
    });

    // Apply tool hygiene to unmapped slots
    const processedSteps: any[] = [];
    for (const s of normalized) {
      if (!s.slotsToCollect || s.slotsToCollect.length === 0) {
        const stepText = `${s.stateId || ''} ${s.stateName || ''} ${s.objective || ''} ${(s.invokesTools || []).join(' ')}`;
        if (/whatsapp|phone|mobile|contact_number|telephone/i.test(stepText)) {
          s.slotsToCollect = [/whatsapp/i.test(stepText) ? "whatsapp_number" : "phone_number"];
          if (!s.invokesTools) s.invokesTools = [];
          if (!s.invokesTools.includes("validate_digit_input")) s.invokesTools.push("validate_digit_input");
          if (!s.invokesTools.includes("set_capture_mode")) s.invokesTools.push("set_capture_mode");
        } else if (/pin|pincode|otp|passcode/i.test(stepText)) {
          s.slotsToCollect = ["pin_code"];
          if (!s.invokesTools) s.invokesTools = [];
          if (!s.invokesTools.includes("validate_digit_input")) s.invokesTools.push("validate_digit_input");
          if (!s.invokesTools.includes("set_capture_mode")) s.invokesTools.push("set_capture_mode");
        }
      }
      processedSteps.push(s);
    }

    // Stage 2: Dedupe by canonical ID
    const deduped = WorkflowArchitect.dedupeStatesByCanonicalId(processedSteps);

    // Stage 3: Ensure advisory stages
    const withAdvisory = WorkflowArchitect.ensureAdvisoryStages(deduped, requiredStages, isHindiOrHinglish);

    // Stage 4: Order by sequence
    const ordered = WorkflowArchitect.orderFlow(withAdvisory);

    // Stage 5: Fix up branches using default routing for safety
    const routed = WorkflowArchitect.ensureDefaultRouting(ordered);

    return routed;
  }
}
