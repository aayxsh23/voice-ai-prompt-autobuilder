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

    const terminalStepsArray: any[] = [];
    if (meta.terminalStates && Array.isArray(meta.terminalStates) && meta.terminalStates.length > 0) {
      const defaultClose = isHindiOrHinglish
        ? `Say: "बहुत धन्यवाद। हमारी टीम इस पर शीघ्र ही आगे की कार्रवाई करेगी। आपका दिन शुभ हो!"`
        : `Say: "Wonderful. Our team will review this and follow up shortly. Thank you for your time, and have a great day!"`;
      meta.terminalStates.forEach((ts: any, tIdx: number) => {
        const raw = typeof ts.closingScript === 'string' ? ts.closingScript.trim() : '';
        const isSpeech = !!raw && !isInstructionLike(raw);
        if (raw && !isSpeech) {
          logger.warn("WorkflowArchitect: terminalState closingScript is an instruction, not speech", { stateId: ts.stateId, closingScript: raw });
        }
        terminalStepsArray.push({
          sequenceOrder: nextSeqAfterSlots + 1 + tIdx,
          stateId: ts.stateId || `terminal_${tIdx}`,
          stateName: ts.label || `Terminal Close ${tIdx + 1}`,
          objective: ts.label || "Cleanly end the call after final confirmation.",
          behaviorDirective: isSpeech ? undefined : (raw || undefined),
          scriptDirective: isSpeech ? (raw.startsWith("Say:") ? raw : `Say: "${raw}"`) : defaultClose,
          slotsToCollect: [] as string[],
          branchingConditions: [
            { condition: "Concluding call", goToStep: "end_call", reason: ts.stateId || "completed" }
          ],
          fallbackBehavior: isHindiOrHinglish ? `Say: "बात करने के लिए धन्यवाद, शुभ दिन!"` : `Say: "Thank you for speaking with me today, goodbye!"`,
          maxRetries: 1,
          invokesTools: ["end_call"],
          isFallback: true,
          isTerminal: true
        });
      });
    } else {
      terminalStepsArray.push({
        sequenceOrder: nextSeqAfterSlots + 1,
        stateId: "resolution",
        stateName: "Resolution & Terminal Close",
        objective: "Cleanly end the call after final confirmation.",
        scriptDirective: isHindiOrHinglish
          ? `Say: "बहुत धन्यवाद। हमारी टीम इस पर शीघ्र ही आगे की कार्रवाई करेगी। आपका दिन शुभ हो!"`
          : `Say: "Wonderful. Our team will review this and follow up shortly. Thank you for your time, and have a great day!"`,
        slotsToCollect: [] as string[],
        branchingConditions: [
          { condition: "Concluding call", goToStep: "end_call", reason: "completed" }
        ],
        fallbackBehavior: isHindiOrHinglish ? `Say: "बात करने के लिए धन्यवाद, शुभ दिन!"` : `Say: "Thank you for speaking with me today, goodbye!"`,
        maxRetries: 1,
        invokesTools: ["end_call"],
        isFallback: true,
        isTerminal: true
      });
    }

    let fallbackSteps: any[] = [];
    if (requiredStages && Array.isArray(requiredStages) && requiredStages.length > 0) {
      const stageSteps: any[] = [];
      requiredStages.forEach((stage: any, sIdx: number) => {
        const stId = String(stage.id || '').toLowerCase();
        const stLabel = stage.label || stage.id || `Stage ${sIdx + 1}`;
        if (sIdx === 0 || /opening|identity|greet/i.test(stId)) {
          stageSteps.push({
            ...step1,
            stateId: stId === 'identity_gate' ? stId : (stage.id || step1.stateId),
            stateName: stLabel,
            sequenceOrder: stageSteps.length + 1
          });
        } else if (/confirm|readback/i.test(stId)) {
          stageSteps.push({
            ...confirmStep,
            stateId: stage.id || confirmStep.stateId,
            stateName: stLabel,
            sequenceOrder: stageSteps.length + 1
          });
        } else if (/close|resolut|terminal|end/i.test(stId) || sIdx === requiredStages.length - 1) {
          if (terminalStepsArray.length > 0 && stageSteps.length + terminalStepsArray.length >= requiredStages.length) {
            terminalStepsArray.forEach(t => {
              stageSteps.push({ ...t, sequenceOrder: stageSteps.length + 1 });
            });
          } else {
            stageSteps.push({
              ...terminalStepsArray[0],
              stateId: stage.id || terminalStepsArray[0].stateId,
              stateName: stLabel,
              sequenceOrder: stageSteps.length + 1
            });
          }
        } else if (/collect|capture|booking|qualif|requirement|detail/i.test(stId) || (slotsArray.length > 0 && !stageSteps.some(s => Array.isArray(s.slotsToCollect) && s.slotsToCollect.length > 0))) {
          if (slotsArray.length > 0) {
            slotSteps.forEach((slStep, slIdx) => {
              stageSteps.push({
                ...slStep,
                stateId: slIdx === 0 ? (stage.id || slStep.stateId) : slStep.stateId,
                stateName: slIdx === 0 ? stLabel : slStep.stateName,
                sequenceOrder: stageSteps.length + 1
              });
            });
          } else {
            stageSteps.push({
              sequenceOrder: stageSteps.length + 1,
              stateId: stage.id,
              stateName: stLabel,
              objective: `Collect details for ${stLabel}`,
              scriptDirective: buildIntentDrivenAsk("caller_intent", isHindiOrHinglish, false),
              slotsToCollect: ["caller_intent"],
              branchingConditions: [
                { condition: "Details provided", goToStep: stageSteps.length + 2 },
                { condition: "Caller declines", goToStep: "end_call", reason: "declined" }
              ],
              fallbackBehavior: buildIntentDrivenAsk("caller_intent", isHindiOrHinglish, true),
              maxRetries: 3,
              invokesTools: [],
              isFallback: true
            });
          }
        } else {
          stageSteps.push({
            sequenceOrder: stageSteps.length + 1,
            stateId: stage.id,
            stateName: stLabel,
            objective: `Execute stage: ${stLabel}`,
            ...buildGenericStageTurn(stLabel, isHindiOrHinglish),
            slotsToCollect: [] as string[],
            branchingConditions: [
              { condition: "Caller acknowledges or agrees", goToStep: stageSteps.length + 2 },
              { condition: "Caller declines or disconnects", goToStep: "end_call", reason: "declined" }
            ],
            maxRetries: 3,
            invokesTools: [] as string[],
            isFallback: true
          });
        }
      });
      fallbackSteps = stageSteps;
      fallbackSteps.forEach((s, i) => { s.sequenceOrder = i + 1; });
    } else {
      fallbackSteps = [step1, ...slotSteps, confirmStep, ...terminalStepsArray];
    }

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

  private static postProcessSteps(
    steps: any[],
    expectedOutfields: Set<string>,
    isInbound: boolean,
    meta: any,
    isHindiOrHinglish: boolean,
    requiredStages: any[] = [],
    infieldsList: any[] = []
  ): any[] {
    const refined: any[] = [];
    const collectedSoFar = new Set<string>();
    const collectedCores = new Set<string>();
    const vf = hindiVerbForms(meta?.agentGender === 'male' ? 'male' : 'female');
    const denyAi = meta?.aiDisclosure === 'deny';

    steps.forEach((s: any, idx: number) => {
      const preservedProps = {
        onFailure: s.onFailure,
        confirmationRequired: s.confirmationRequired,
        digressionAllowed: s.digressionAllowed,
        invokesTools: s.invokesTools || [],
        isFallback: s.isFallback,
        isTerminal: s.isTerminal
      };

      if (idx === 0 || s.stateId === 'identity_gate') {
        let directive = s.scriptDirective || "";
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
        s.scriptDirective = directive;
        refined.push({ ...s, ...preservedProps, sequenceOrder: 1 });
        return;
      }

      const rawSlots = (Array.isArray(s.slotsToCollect) ? s.slotsToCollect.filter(Boolean) : []).filter((slot: string) => !isDerivedSlot(slot));
      const slots: string[] = [];
      rawSlots.forEach((singleSlot: string) => {
        const core = getSemanticCore(singleSlot);
        if (!collectedCores.has(core) && !collectedSoFar.has(singleSlot)) {
          collectedCores.add(core);
          collectedSoFar.add(singleSlot);
          slots.push(singleSlot);
        }
      });

      if (rawSlots.length > 0 && slots.length === 0 && s.stateId !== 'confirmation_readback' && s.stateId !== 'resolution' && !s.isTerminal) {
        return;
      }

      if (slots.length > 1 && s.stateId !== 'confirmation_readback' && s.stateId !== 'resolution' && !s.isTerminal) {
        slots.forEach((singleSlot: string, sIdx: number) => {
          const fName = singleSlot.replace(/_/g, ' ');
          const directive = (sIdx === 0 && s.scriptDirective && !isInstructionLike(s.scriptDirective))
            ? s.scriptDirective
            : buildIntentDrivenAsk(singleSlot, isHindiOrHinglish, false);
          const fallback = (sIdx === 0 && s.fallbackBehavior && !isInstructionLike(s.fallbackBehavior))
            ? s.fallbackBehavior
            : buildIntentDrivenAsk(singleSlot, isHindiOrHinglish, true);

          refined.push({
            ...s,
            ...preservedProps,
            sequenceOrder: refined.length + 1,
            stateId: sIdx === 0 ? s.stateId : `capture_${singleSlot.toLowerCase()}`,
            stateName: sIdx === 0 ? s.stateName : `Capture ${fName}`,
            objective: `Collect: ${singleSlot}`,
            scriptDirective: directive,
            fallbackBehavior: fallback,
            slotsToCollect: [singleSlot]
          });
        });
      } else {
        if (slots.length > 0) {
          s.slotsToCollect = slots;
        } else {
          const stepText = `${s.stateId || ''} ${s.stateName || ''} ${s.objective || ''} ${(preservedProps.invokesTools || []).join(' ')}`;
          if (/whatsapp|phone|mobile|contact_number|telephone/i.test(stepText)) {
            s.slotsToCollect = [/whatsapp/i.test(stepText) ? "whatsapp_number" : "phone_number"];
            if (!preservedProps.invokesTools.includes("validate_digit_input")) preservedProps.invokesTools.push("validate_digit_input");
            if (!preservedProps.invokesTools.includes("set_capture_mode")) preservedProps.invokesTools.push("set_capture_mode");
          } else if (/pin|pincode|otp|passcode/i.test(stepText)) {
            s.slotsToCollect = ["pin_code"];
            if (!preservedProps.invokesTools.includes("validate_digit_input")) preservedProps.invokesTools.push("validate_digit_input");
            if (!preservedProps.invokesTools.includes("set_capture_mode")) preservedProps.invokesTools.push("set_capture_mode");
          }
        }
        s.sequenceOrder = refined.length + 1;
        refined.push({ ...s, ...preservedProps });
      }
    });

    const missingOutfields = semanticDedupSlots(Array.from(expectedOutfields)).filter((o: string) => {
      const core = getSemanticCore(o);
      return !collectedCores.has(core) && !collectedSoFar.has(o) && o !== 'caller_intent';
    });

    if (missingOutfields.length > 0 && refined.length >= 2) {
      let insertIdx = refined.findIndex((s: any) =>
        /collect|capture|booking|qualif|requirement|detail/i.test(`${s.stateId || ''} ${s.stateName || ''}`) ||
        (Array.isArray(s.slotsToCollect) && s.slotsToCollect.length > 0)
      );
      if (insertIdx === -1) {
        insertIdx = refined.findIndex((s: any) => s.stateId?.includes('confirm') || s.stateId?.includes('readback') || s.stateId?.includes('resolution') || s.isTerminal);
      } else {
        while (insertIdx + 1 < refined.length && (Array.isArray(refined[insertIdx + 1].slotsToCollect) && refined[insertIdx + 1].slotsToCollect.length > 0)) {
          insertIdx++;
        }
      }
      if (insertIdx === -1) insertIdx = refined.length - 1;

      missingOutfields.forEach((slot: string) => {
        collectedSoFar.add(slot);
        collectedCores.add(getSemanticCore(slot));
        const fName = slot.replace(/_/g, ' ');
        const newStep = {
          sequenceOrder: insertIdx + 1,
          stateId: `capture_${slot.toLowerCase()}`,
          stateName: `Capture ${fName}`,
          objective: `Capture required field: ${slot}`,
          scriptDirective: buildIntentDrivenAsk(slot, isHindiOrHinglish, false),
          slotsToCollect: [slot],
          branchingConditions: [
            { condition: `${fName} provided`, goToStep: insertIdx + 2 },
            { condition: "Caller asks for callback", goToStep: "end_call", reason: "callback_requested" }
          ],
          fallbackBehavior: buildIntentDrivenAsk(slot, isHindiOrHinglish, true),
          maxRetries: 3,
          invokesTools: []
        };
        refined.splice(insertIdx + 1, 0, newStep);
        insertIdx++;
      });
    }

    if (Array.isArray(requiredStages) && requiredStages.length > 0) {
      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const existingTokens = refined.map(s => norm(`${s.stateId || ''} ${s.stateName || ''} ${s.objective || ''}`));
      requiredStages.forEach((st: any, stIdx: number) => {
        const t = norm(st.id || '');
        if (t && !existingTokens.some(ex => ex.includes(t))) {
          let insertPoint = refined.length - 1;
          const confirmIdx = refined.findIndex(s => s.stateId?.includes('confirm') || s.stateId?.includes('readback'));
          if (confirmIdx !== -1) insertPoint = confirmIdx;

          const newStageStep = {
            sequenceOrder: insertPoint + 1,
            stateId: st.id,
            stateName: st.label || st.id.replace(/_/g, ' '),
            objective: st.label || `Execute required stage: ${st.id}`,
            ...buildGenericStageTurn(st.label || st.id.replace(/_/g, ' '), isHindiOrHinglish),
            slotsToCollect: [] as string[],
            branchingConditions: [
              { condition: "Caller agrees/shows interest", goToStep: insertPoint + 2 },
              { condition: "Caller declines", goToStep: "end_call", reason: "stage_declined" }
            ],
            maxRetries: 3,
            invokesTools: []
          };
          refined.splice(insertPoint, 0, newStageStep);
          existingTokens.splice(insertPoint, 0, norm(`${newStageStep.stateId} ${newStageStep.stateName}`));
        }
      });
    }

    refined.forEach((st: any, index: number) => { st.sequenceOrder = index + 1; });

    if (Array.isArray(infieldsList) && infieldsList.length > 0 && refined.length >= 2) {
      infieldsList.forEach((infield: any) => {
        const key = infield?.key;
        if (!key || /first_name|caller_name|^name$/i.test(key)) return;
        const alreadyUsed = refined.some(s =>
          (s.scriptDirective || '').includes(`{{${key}}}`) ||
          (s.objective || '').includes(`{{${key}}}`) ||
          (Array.isArray(s.branchingConditions) && s.branchingConditions.some((b: any) => (b.condition || '').includes(`{{${key}}}`)))
        );
        if (!alreadyUsed) {
          const targetStep = refined.find(s =>
            s.stateId !== 'identity_gate' && s.stateId !== 'confirmation_readback' && !s.isTerminal &&
            /pitch|offer|reminder|segment|context|qualif/i.test(`${s.stateId || ''} ${s.stateName || ''} ${s.objective || ''}`)
          ) || refined[1] || refined[0];

          if (targetStep) {
            targetStep.objective = `${targetStep.objective || ''} (Tailored by pre-call {{${key}}})`.trim();
            if (Array.isArray(targetStep.branchingConditions) && targetStep.branchingConditions.length > 0) {
              targetStep.branchingConditions.unshift({
                condition: `If pre-call {{${key}}} indicates specific status or category`,
                goToStep: targetStep.sequenceOrder + 1
              });
            }
          }
        }
      });
    }

    refined.forEach((st: any) => {
      if (st.stateId?.includes('confirm') || st.stateId?.includes('readback') || st.stateName?.toLowerCase().includes('confirm')) {
        const allSlotsToConfirm = semanticDedupSlots(Array.from(collectedSoFar)).filter(Boolean);
        if (allSlotsToConfirm.length > 0) {
          const readbackStr = allSlotsToConfirm.map((s: string) => `${s.replace(/_/g, ' ')}: [${s}]`).join(', ');
          if (!allSlotsToConfirm.some((s: string) => (st.scriptDirective || '').includes(`[${s}]`))) {
            st.scriptDirective = isHindiOrHinglish
              ? `Say: "धन्यवाद। एक बार मैं आपके दिए गए विवरण की पुष्टि कर लेती हूँ: ${readbackStr}। क्या यह सभी जानकारी सही है?"`
              : `Say: "Thank you. Let me verify the details I've noted so far: ${readbackStr}. Does everything look correct?"`;
          }
        }
      }
    });

    // Final guard: whatever the source (LLM, user-defined steps, terminalStates), a
    // scriptDirective must be literal speech. Anything instruction-shaped would be
    // read aloud to the caller, so demote it to behaviorDirective and substitute a
    // real line. Applies to every domain — no per-case handling.
    const genericClose = isHindiOrHinglish
      ? `Say: "बात करने के लिए धन्यवाद। आपका दिन शुभ हो!"`
      : `Say: "Thank you for your time today. Have a great day!"`;
    const genericAsk = isHindiOrHinglish
      ? `Say: "क्या आप मुझे इसके बारे में थोड़ा और बता सकते हैं?"`
      : `Say: "Could you tell me a little more about that?"`;

    refined.forEach((st: any) => {
      if (!st?.scriptDirective || !isInstructionLike(st.scriptDirective)) return;
      const original = String(st.scriptDirective).replace(/^Say:\s*"|"$/g, '').trim();
      logger.warn("WorkflowArchitect: scriptDirective was an instruction, not speech — demoted", { stateId: st.stateId, directive: original });
      st.behaviorDirective = st.behaviorDirective ? `${st.behaviorDirective} ${original}` : original;
      st.scriptDirective = (st.isTerminal || /clos|resolution|end|not_interested|wrong_number|abusive|out_of_scope|retry/i.test(st.stateId || ''))
        ? genericClose
        : genericAsk;
    });

    return refined;
  }
}
