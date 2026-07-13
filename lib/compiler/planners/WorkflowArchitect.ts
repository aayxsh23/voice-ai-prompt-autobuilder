import { BusinessSpecification } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { safeParseJson } from "@/lib/llm/types";
import { semanticDedupSlots, getSemanticCore } from "@/lib/compiler/assembler/PromptAssembler";
import { hindiVerbForms } from "@/lib/llm/language/LanguagePolicy";
import { isDerivedSlot } from "@/lib/compiler/constants/slotRegistry";
import { logger } from "@/lib/logger";

export class WorkflowArchitect {
  public static async planWorkflow(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['callFlowPlan']['steps']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;
    const languageMode = meta.languageMode || (spec as any).languageMode || 'english';
    const capturedTopics = spec.capturedTopics || [];
    const resolvedTopics = spec.resolvedTopics || [];
    // Primary output language is decided by the declared mode only — a multilingual /
    // English-default agent must NOT be flipped to Hindi just because the discovery
    // notes mention Hindi support.
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish';
    const primaryGoal = meta.primaryGoal || meta.description || "Assist callers professionally";

    // Extract call direction (inbound vs outbound)
    const callDirection = (meta.callDirection || '').toLowerCase() || (
      /\b(inbound|customer support|helpline|receptionist|incoming|answer calls|handle queries|receive calls|support line)\b/i.test(`${primaryGoal} ${meta.agentName} ${meta.companyName}`) ? 'inbound' : 'outbound'
    );
    const isInbound = callDirection === 'inbound';

    // Extract all known outfields from dynamicVariables + existing steps
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
    // Derived/classification outfields (objection_type, intent_category, eligibility_status,
    // detected_language, opt_out_*, …) are extracted silently from the conversation — they
    // must NEVER become "please tell me your <x>" steps. Drop them from the collectable set.
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

    // 1. Identity / Greeting Step (tailored for Outbound vs Inbound - Issue #8 & Inbound Review)
    const step1 = isHindiOrHinglish ? {
      sequenceOrder: 1,
      stateId: "identity_gate",
      stateName: isInbound ? "Inbound Greeting & Purpose" : "Identity Gate & Greeting",
      objective: isInbound ? "Greet incoming caller warmly, proactively disclose AI assistant identity, and ask how you can help." : "Verify identity of caller and proactively disclose AI assistant identity.",
      scriptDirective: isInbound
        ? `Say: "नमस्ते, ${companyStr} में कॉल करने के लिए धन्यवाद। मैं ${agentStr}, आपकी AI वॉयस असिस्टेंट हूँ। आज मैं आपकी क्या सहायता कर ${vf.sakti} हूँ?"`
        : `Say: "नमस्ते, मैं ${companyStr} से ${agentStr}, एक AI असिस्टेंट बात कर ${vf.rahi} हूँ। क्या मेरी बात ${hindiContactString} से हो रही है?"`,
      slotsToCollect: [] as string[],
      branchingConditions: isInbound ? [
        { condition: "Caller states request or query", goToStep: 2 },
        { condition: "Caller disconnects", goToStep: "end_call", reason: "caller_disconnected" }
      ] : [
        { condition: "Caller confirms identity", goToStep: 2 },
        { condition: "Caller busy or not available", goToStep: "end_call", reason: "not_available" },
        { condition: "Wrong number", goToStep: "end_call", reason: "wrong_number" }
      ],
      fallbackBehavior: isHindiOrHinglish
        ? (isInbound ? `Say: "कृपया बताएं आज मैं आपकी क्या मदद कर ${vf.sakti} हूँ?"` : `Say: "माफ़ कीजिएगा, क्या मेरी बात ${hindiContactString} से हो रही है?"`)
        : `Say: "How can I assist you today?"`,
      maxRetries: 3,
      invokesTools: [] as string[],
      isFallback: true
    } : {
      sequenceOrder: 1,
      stateId: "identity_gate",
      stateName: isInbound ? "Inbound Greeting & Purpose" : "Identity Gate & Greeting",
      objective: isInbound ? "Greet incoming caller warmly, proactively disclose AI assistant identity, and ask how you can help." : "Verify identity of caller and proactively disclose AI assistant identity.",
      scriptDirective: isInbound
        ? `Say: "Thank you for calling ${companyStr}. My name is ${agentStr}, your AI voice assistant. How can I help you today?"`
        : `Say: "Hello, I'm ${agentStr}, an AI assistant calling on behalf of ${companyStr}. Am I speaking with ${greetingContactString}?"`,
      slotsToCollect: [] as string[],
      branchingConditions: isInbound ? [
        { condition: "Caller states request or query", goToStep: 2 },
        { condition: "Caller disconnects", goToStep: "end_call", reason: "caller_disconnected" }
      ] : [
        { condition: "Caller confirms", goToStep: 2 },
        { condition: "Busy or not available", goToStep: "end_call", reason: "not_available" },
        { condition: "Wrong number", goToStep: "end_call", reason: "wrong_number" }
      ],
      fallbackBehavior: isInbound
        ? `Say: "Could you please share what you would like assistance with today?"`
        : `Say: "I understand you might be busy, is there a better time to reach you?"`,
      maxRetries: 3,
      invokesTools: [] as string[],
      isFallback: true
    };

    // 2. Build discrete slot collection steps (`Issue #3` & `Issue #7`)
    const slotSteps: any[] = [];
    const slotsArray = Array.from(existingSlots).filter(Boolean);
    if (slotsArray.length === 0) {
      slotSteps.push({
        sequenceOrder: 2,
        stateId: "requirement_collection",
        stateName: "Requirement & Data Collection",
        objective: `Collect details for: ${primaryGoal}`,
        scriptDirective: isHindiOrHinglish
          ? `Say: "मैं आपके requirements समझने के लिए कॉल कर रही हूँ। आप मुख्य रूप से किस चीज़ में सहायता चाहते हैं?"`
          : `Say: "I'd love to quickly understand your requirements so our team can assist you effectively. What is your primary goal right now?"`,
        slotsToCollect: ["caller_intent"],
        branchingConditions: [
          { condition: "Information provided", goToStep: 3 },
          { condition: "Caller asks for callback", goToStep: "end_call", reason: "callback_requested" }
        ],
        fallbackBehavior: isHindiOrHinglish ? `Say: "कृपया अपने मुख्य requirements संक्षेप में बताएं।"` : `Say: "Could you briefly share what you are looking to accomplish?"`,
        maxRetries: 3,
        invokesTools: [],
        isFallback: true
      });
    } else {
      slotsArray.forEach((slot, idx) => {
        const stepNum = idx + 2;
        const formattedName = slot.replace(/_/g, ' ');
        slotSteps.push({
          sequenceOrder: stepNum,
          stateId: `capture_${slot.toLowerCase()}`,
          stateName: `Capture ${formattedName}`,
          objective: `Ask specifically for and capture: ${slot}`,
          scriptDirective: isHindiOrHinglish
            ? `Say: "कृपया मुझे अपना ${formattedName} बताएं ताकि हम सही जानकारी नोट कर सकें।"`
            : `Say: "Could you please share your ${formattedName}?"`,
          slotsToCollect: [slot],
          branchingConditions: [
            { condition: `${formattedName} provided`, goToStep: stepNum + 1 },
            { condition: "Caller asks for callback", goToStep: "end_call", reason: "callback_requested" }
          ],
          fallbackBehavior: isHindiOrHinglish ? `Say: "कृपया अपना ${formattedName} स्पष्ट रूप से बताएं।"` : `Say: "Please clearly state your ${formattedName}."`,
          maxRetries: 3,
          invokesTools: [],
          isFallback: true
        });
      });
    }

    const nextSeqAfterSlots = 2 + slotSteps.length;
    const allCollectedSlots = slotsArray.length > 0 ? slotsArray : ["caller_intent"];
    const readbackStr = allCollectedSlots.map(s => `${s.replace(/_/g, ' ')}: [${s}]`).join(', ');

    // 3. Dynamic Confirmation Readback Step (`Issue #5`)
    const confirmStep = {
      sequenceOrder: nextSeqAfterSlots,
      stateId: "confirmation_readback",
      stateName: "Confirmation Read-Back",
      objective: "Read back and confirm all collected details before closing.",
      scriptDirective: isHindiOrHinglish
        ? `Say: "धन्यवाद। एक बार मैं आपके दिए गए विवरण की पुष्टि कर लेती हूँ: ${readbackStr}। क्या यह सभी जानकारी सही है?"`
        : `Say: "Thank you. Let me verify the details I've noted so far: ${readbackStr}. Does everything look correct?"`,
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

    // 4. Resolution & Terminal Close (`Issue #4`)
    const terminalStep = {
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
    };

    const fallbackSteps = [step1, ...slotSteps, confirmStep, terminalStep];

    const genderDirective = isHindiOrHinglish
      ? `\nAGENT GENDER: The agent is ${agentGender}. Use ${agentGender === 'male' ? 'MASCULINE' : 'FEMININE'} verb inflections for the agent's own speech (e.g., "${agentGender === 'male' ? 'कर रहा हूँ, कर सकता हूँ' : 'कर रही हूँ, कर सकती हूँ'}"). Address the caller respectfully with "आप" and plural verbs.`
      : "";
    const disclosureDirective = denyAiDisclosure
      ? `\nAI DISCLOSURE: DO NOT disclose or hint that the agent is an AI. The identity/greeting step must present the agent as a human representative of the company; never say "AI assistant".`
      : `\nAI DISCLOSURE: The identity/greeting step MUST proactively state that the agent is an AI assistant for the company.`;
    const langDirective = isHindiOrHinglish
      ? `\nCRITICAL LANGUAGE DIRECTIVE:\nThis voice agent communicates in Hindi/Hinglish (languageMode '${languageMode}'). EVERY SINGLE scriptDirective and fallbackBehavior across every step MUST be written in Devanagari script (देवनागरी), NOT Romanized English. ONLY specific domain keywords can remain in English letters.${genderDirective}${disclosureDirective}`
      : `${disclosureDirective}`;

    const prompt = `You are a WorkflowArchitect specializing in designing deterministic voice AI call flow state machines.
Given the following business goal, metadata, and operational topics, design a comprehensive, multi-step call flow state machine (typically 4 to 8 steps).${langDirective}

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

MANDATORY STATE MACHINE DESIGN RULES:
1. ONE QUESTION PER TURN: Ask exactly ONE question or prompt in each step. Never stack multiple questions in a single turn.
2. DEDICATED SLOT STEPS: If multiple variables/outfields must be collected (e.g. fitness_goal, health_concerns, language_preference, callback_time), generate ONE dedicated state step for each slot! Never collect more than one slot in a single step.
3. CALL DIRECTION & PROACTIVE AI DISCLOSURE:
   - If Call Direction is INBOUND: Step 1 (identity_gate) MUST greet the caller warmly, proactively state upfront that you are an AI assistant for ${meta.companyName || 'Company'}, and ask how you can help (e.g., "Thank you for calling ${meta.companyName || 'Company'}. I'm ${meta.agentName || 'Assistant'}, your AI voice assistant. How can I help you today?"). Do NOT ask "Am I speaking with..." on inbound calls!
   - If Call Direction is OUTBOUND: Step 1 (identity_gate) MUST state upfront that you are an AI assistant calling on behalf of ${meta.companyName || 'Company'}, and verify the caller's identity (using {{first_name}} or {{name}} if available).
4. BRANCHING & ROUTING: Every step must include explicit 'branchingConditions' indicating transitions (e.g., if confirmed -> goToStep N; if busy/wrong number -> goToStep 'end_call' or 'transfer').
5. READ-BACK CONFIRMATION: The step right before the final closing step MUST be a 'Confirmation Read-Back' step where the agent reads back all collected slots explicitly (${readbackStr}) to verify accuracy.
6. WIRE END_CALL ON TERMINAL STEPS: The final closing step and all terminal error/refusal branches MUST specify 'end_call' in their branching transition ('goToStep: "end_call"') OR in 'invokesTools: ["end_call"]'.

DENSITY: Keep every scriptDirective and fallbackBehavior to 1-2 short spoken sentences. No rationale or meta-commentary. State rules once; do not restate global policy inside steps.

Return a JSON array of step objects with sequenceOrder, stateId, stateName, objective, scriptDirective, slotsToCollect, branchingConditions, fallbackBehavior, maxRetries, and invokesTools.`;

    try {
      const userDefinedSteps = spec.callFlowPlan?.userDefinedSteps || [];
      const existingCustomSteps = (spec.callFlowPlan?.steps || []).filter((s: any) => !s.isFallback);
      if (userDefinedSteps.length > 0) {
        return WorkflowArchitect.postProcessSteps(userDefinedSteps, existingSlots, isInbound, meta, isHindiOrHinglish);
      }
      if (existingCustomSteps.length >= 2) {
        return WorkflowArchitect.postProcessSteps(existingCustomSteps, existingSlots, isInbound, meta, isHindiOrHinglish);
      }

      const response = await geminiClient.generate({
        systemInstruction: `You are a structured JSON workflow planning specialist. Return ONLY a valid JSON array of step objects.${isHindiOrHinglish ? " All Say: dialogue inside scriptDirective MUST be written in Devanagari script (देवनागरी)." : ""}`,
        prompt,
        responseMimeType: "application/json"
      });
      const parsed = safeParseJson(response.text, fallbackSteps);
      let steps = Array.isArray(parsed) && parsed.length >= 3 ? parsed : fallbackSteps;
      steps = WorkflowArchitect.postProcessSteps(steps, existingSlots, isInbound, meta, isHindiOrHinglish);
      return steps.length > 0 ? steps : fallbackSteps;
    } catch (err) {
      logger.warn("WorkflowArchitect fallback triggered", err);
      return WorkflowArchitect.postProcessSteps(fallbackSteps, existingSlots, isInbound, meta, isHindiOrHinglish);
    }
  }

  private static postProcessSteps(
    steps: any[],
    expectedOutfields: Set<string>,
    isInbound: boolean,
    meta: any,
    isHindiOrHinglish: boolean
  ): any[] {
    const refined: any[] = [];
    const collectedSoFar = new Set<string>();
    const collectedCores = new Set<string>();
    const vf = hindiVerbForms(meta?.agentGender === 'male' ? 'male' : 'female');
    const denyAi = meta?.aiDisclosure === 'deny';

    steps.forEach((s: any, idx: number) => {
      // Preserve user-elicited flags and branch policies
      const preservedProps = {
        onFailure: s.onFailure,
        confirmationRequired: s.confirmationRequired,
        digressionAllowed: s.digressionAllowed,
        invokesTools: s.invokesTools || [],
        isFallback: s.isFallback,
        isTerminal: s.isTerminal
      };

      // Ensure proactive AI disclosure on step 1 (`Issue #8`), UNLESS the deployment
      // is configured to present as a human representative (aiDisclosure: 'deny').
      if (idx === 0 || s.stateId === 'identity_gate') {
        let directive = s.scriptDirective || "";
        const hasDisclosure = /ai assistant|ai voice|ai असिस्टेंट/i.test(directive);
        if (!denyAi && !hasDisclosure) {
          if (isInbound) {
            directive = isHindiOrHinglish
              ? `Say: "नमस्ते, ${meta?.companyName || 'कंपनी'} में कॉल करने के लिए धन्यवाद। मैं ${meta?.agentName || 'असिस्टेंट'}, आपकी AI वॉयस असिस्टेंट हूँ। आज मैं आपकी क्या सहायता कर ${vf.sakti} हूँ?"`
              : `Say: "Thank you for calling ${meta?.companyName || 'our team'}. My name is ${meta?.agentName || 'Agent'}, your AI voice assistant. How can I help you today?"`;
          } else {
            const contactTarget = /{{[a-zA-Z0-9_]+}}/.exec(directive)?.[0] || (isHindiOrHinglish ? "सही नंबर पर" : "the right contact today");
            directive = isHindiOrHinglish
              ? `Say: "नमस्ते, मैं ${meta?.companyName || 'कंपनी'} से ${meta?.agentName || 'एजेंट'}, एक AI असिस्टेंट बात कर ${vf.rahi} हूँ। क्या मेरी बात ${contactTarget} से हो रही है?"`
              : `Say: "Hello, I'm ${meta?.agentName || 'Agent'}, an AI assistant calling on behalf of ${meta?.companyName || 'our team'}. Am I speaking with ${contactTarget}?"`;
          }
        } else if (denyAi && !directive) {
          directive = isInbound
            ? (isHindiOrHinglish
                ? `Say: "नमस्ते, ${meta?.companyName || 'कंपनी'} में कॉल करने के लिए धन्यवाद। आज मैं आपकी क्या मदद कर ${vf.sakti} हूँ?"`
                : `Say: "Thank you for calling ${meta?.companyName || 'our team'}. How can I help you today?"`)
            : (isHindiOrHinglish
                ? `Say: "नमस्ते, मैं ${meta?.companyName || 'कंपनी'} से ${meta?.agentName || 'एजेंट'} बात कर ${vf.rahi} हूँ।"`
                : `Say: "Hello, I'm ${meta?.agentName || 'Agent'} from ${meta?.companyName || 'our team'}."`);
        }
        s.scriptDirective = directive;
        refined.push({ ...s, ...preservedProps, sequenceOrder: 1 });
        return;
      }

      // Semantic deduplication against previously collected slots or within the step itself.
      // Also drop derived/classification slots so they never become a caller question.
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

      // If after semantic deduplication, a capture step has no slots left because they were captured earlier, skip it completely
      if (rawSlots.length > 0 && slots.length === 0 && s.stateId !== 'confirmation_readback' && s.stateId !== 'resolution' && !s.isTerminal) {
        return;
      }

      // If a step has multiple slots (`Issue #3`), split into discrete 1-slot steps
      if (slots.length > 1 && s.stateId !== 'confirmation_readback' && s.stateId !== 'resolution') {
        slots.forEach((singleSlot: string, sIdx: number) => {
          const fName = singleSlot.replace(/_/g, ' ');
          refined.push({
            ...s,
            ...preservedProps,
            sequenceOrder: refined.length + 1,
            stateId: sIdx === 0 ? s.stateId : `capture_${singleSlot.toLowerCase()}`,
            stateName: sIdx === 0 ? s.stateName : `Capture ${fName}`,
            objective: `Collect: ${singleSlot}`,
            scriptDirective: isHindiOrHinglish
              ? `Say: "कृपया मुझे अपना ${fName} बताएं ताकि हम सही जानकारी दर्ज कर सकें।"`
              : `Say: "Could you please share your ${fName}?"`,
            slotsToCollect: [singleSlot]
          });
        });
      } else {
        if (slots.length > 0) s.slotsToCollect = slots;
        s.sequenceOrder = refined.length + 1;
        refined.push({ ...s, ...preservedProps });
      }
    });

    // Check if any expected outfield (`email`, `callback_time`, etc.) is missing (`Issue #7`)
    const missingOutfields = semanticDedupSlots(Array.from(expectedOutfields)).filter((o: string) => {
      const core = getSemanticCore(o);
      return !collectedCores.has(core) && !collectedSoFar.has(o) && o !== 'caller_intent';
    });

    if (missingOutfields.length > 0 && refined.length >= 2) {
      let insertIdx = refined.findIndex((s: any) => s.stateId?.includes('confirm') || s.stateId?.includes('readback') || s.stateId?.includes('resolution') || s.isTerminal);
      if (insertIdx === -1) insertIdx = refined.length;

      missingOutfields.forEach((slot: string) => {
        collectedSoFar.add(slot);
        collectedCores.add(getSemanticCore(slot));
        const fName = slot.replace(/_/g, ' ');
        const newStep = {
          sequenceOrder: insertIdx + 1,
          stateId: `capture_${slot.toLowerCase()}`,
          stateName: `Capture ${fName}`,
          objective: `Capture required field: ${slot}`,
          scriptDirective: isHindiOrHinglish
            ? `Say: "कृपया मुझे अपना ${fName} बताएं।"`
            : `Say: "Could you please provide your ${fName}?"`,
          slotsToCollect: [slot],
          branchingConditions: [
            { condition: `${fName} provided`, goToStep: insertIdx + 2 },
            { condition: "Caller asks for callback", goToStep: "end_call", reason: "callback_requested" }
          ],
          fallbackBehavior: isHindiOrHinglish ? `Say: "कृपया अपना ${fName} स्पष्ट रूप से बताएं।"` : `Say: "Please clearly state your ${fName}."`,
          maxRetries: 3,
          invokesTools: []
        };
        refined.splice(insertIdx, 0, newStep);
        insertIdx++;
      });

      refined.forEach((st: any, index: number) => { st.sequenceOrder = index + 1; });
    }

    // Ensure confirmation readback explicitly lists all collected outfields (`Issue #5`)
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

    return refined;
  }
}
