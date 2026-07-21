import { BusinessSpecification, safeParseJson } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { FsmStateNode } from "@/lib/llm/types/CallFlowPlan";
import { semanticDedupSlots } from "@/lib/compiler/assembler/PromptAssembler";
import { isDerivedSlot } from "@/lib/compiler/constants/slotRegistry";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool } from "@/lib/compiler/constants/toolRegistry";
import { logger } from "@/lib/logger";

export class WorkflowArchitect {
  public static async planWorkflow(spec: Partial<BusinessSpecification>): Promise<FsmStateNode[]> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;
    const languageMode = meta.languageMode || (spec as any).languageMode || 'english';
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
    const allDynamicVars = Array.isArray((spec as any).dynamicVariables) ? (spec as any).dynamicVariables : [];
    const infieldsList = allDynamicVars.filter((v: any) => v && (v.fieldDirection === 'infield' || v.source === 'crm' || v.source === 'api'));
    const outfieldsList = allDynamicVars.filter((v: any) => v && v.key && v.fieldDirection !== 'infield' && v.source !== 'crm' && v.source !== 'api');
    semanticDedupSlots(outfieldsList.map((o: any) => o.key)).forEach((key: string) => existingSlots.add(key));
    
    for (const s of Array.from(existingSlots)) {
      if (isDerivedSlot(s)) existingSlots.delete(s);
    }

    const companyStr = meta.companyName || (isHindiOrHinglish ? 'कंपनी' : 'our team');
    const agentStr = meta.agentName || (isHindiOrHinglish ? 'असिस्टेंट' : 'Agent');
    const denyAiDisclosure = meta.aiDisclosure === 'deny';

    const fallbackStates: FsmStateNode[] = [
      {
        id: "identity_gate",
        objective: isInbound ? "Greet caller and establish identity / role clearly." : "Verify right contact and state reason for call.",
        slotsToCollect: [],
        speechPrompt: meta.openingPhrase || (isInbound 
          ? `Thank you for calling ${companyStr}. My name is ${agentStr}. How can I help you today?`
          : `Hello, I'm ${agentStr} calling from ${companyStr}. Am I speaking with the right contact?`),
        transitions: [
          { condition: "Identity verified / ready to proceed", nextState: "capture_intent" },
          { condition: "Wrong number / caller busy", nextState: "end_call", speechPrompt: "I will call back later. Goodbye." }
        ]
      },
      {
        id: "capture_intent",
        objective: "Capture caller intent and route accordingly.",
        slotsToCollect: ["caller_intent"],
        transitions: [
          { condition: "Intent provided", nextState: "confirmation_readback" }
        ]
      },
      {
        id: "confirmation_readback",
        objective: "Read back and confirm all collected details before closing.",
        slotsToCollect: [],
        transitions: [
          { condition: "Caller confirms accuracy", nextState: "end_call" },
          { condition: "Caller wants to modify details", nextState: "capture_intent" }
        ]
      },
      {
        id: "end_call",
        objective: "Close the call politely.",
        slotsToCollect: [],
        entryAction: { tool: "end_call", args: {}, speechPrompt: "Thank you for your time. Have a great day!" },
        transitions: []
      }
    ];

    const langDirective = isHindiOrHinglish
      ? `\nLANGUAGE DIRECTIVE: Write all 'speechPrompt' lines inside the FSM nodes in Devanagari script (देवनागरी) Hindi. English terminology should be romanized.`
      : "";

    const prompt = `You are a WorkflowArchitect specializing in designing deterministic voice AI call flow state machines.
Given the following business goal, metadata, and operational topics, design a comprehensive, multi-step Finite State Machine (FSM).${langDirective}

BUSINESS SNAPSHOT:
- **Company Name:** ${meta.companyName || "N/A"}
- **Agent Persona:** ${meta.agentName || "Voice Assistant"} (${meta.agentGender || "female"}, Tone: ${Array.isArray(meta.toneProfile) ? meta.toneProfile.join(', ') : (meta.toneProfile || "Professional")})
- **Primary Goal:** ${primaryGoal}
- **Operating Hours:** ${snap.operatingHours || "N/A"}
- **Services:** ${snap.servicesOffered?.join(', ') || "N/A"}
- **Call Direction:** ${isInbound ? "INBOUND (Customer calls us)" : "OUTBOUND (We call customer)"}
${spec.callFlowPlan?.script || spec.callFlowPlan?.steps?.length ? `\nUSER-DEFINED CALL FLOW LOGIC (CRITICAL):\nThe user has explicitly defined the following logic/steps. You MUST strictly follow this routing, branching, and these spoken actions when generating the FSM state nodes:\n${spec.callFlowPlan.script || JSON.stringify(spec.callFlowPlan.steps, null, 2)}\n` : ""}

CONTEXT VARIABLES & EXTRACTIONS:
${infieldsList.length > 0 ? `Known Pre-Call Infields (Available before call): ${JSON.stringify(infieldsList.map((v: any) => v.key))}\n` : ""}
${existingSlots.size > 0 ? `Required Extractions (Must collect these slots): ${JSON.stringify(Array.from(existingSlots))}\n` : ""}
${requiredStages.length > 0 ? `MANDATORY STAGES: ${JSON.stringify(requiredStages)}\n` : ""}

MANDATORY STATE MACHINE DESIGN RULES:
1. OUTPUT FORMAT: Return ONLY a valid JSON array of FsmStateNode objects.
2. FSM NODE SCHEMA:
   {
     "id": "STEP_1_GREETING",
     "objective": "Clear description of what this state achieves",
     "slotsToCollect": ["slot_key"], // Optional: fields to extract from transcript
     "speechPrompt": "Optional: Specific phrase to speak if no tool is invoked.",
     "entryAction": { // Optional: Tool to invoke BEFORE speaking
       "tool": "tool_name",
       "args": { "param": "value" },
       "speechPrompt": "The spoken phrase the agent should say immediately after the tool."
     },
     "inTurnTool": { // Optional: Tool to invoke when the user speaks in this state
       "tool": "tool_name",
       "args": {}
     },
     "transitions": [
       { "condition": "valid=true", "nextState": "STEP_2", "speechPrompt": "Great, thanks." },
       { "condition": "error=true", "nextState": "STEP_1_GREETING" }
     ]
   }
3. DEDICATED STATES: If multiple variables must be collected, generate ONE dedicated state for each slot! Never collect more than one slot in a single state unless they are inherently paired.
4. CALL DIRECTION & IDENTITY:
   - If Inbound: State 1 MUST greet and ask how to help. Do NOT ask "Am I speaking with...".
   - If Outbound: State 1 MUST introduce the agent and verify the caller's identity.
   - AI DISCLOSURE: ${denyAiDisclosure ? "DO NOT disclose AI identity. Present as a human." : "Proactively disclose that the agent is an AI."}
5. ROUTING & TRANSITIONS: Every state MUST have transitions indicating how to proceed based on conditions. The final state MUST use 'end_call' as its id and invoke the 'end_call' tool. ${spec.callFlowPlan?.script ? "CRITICAL: You MUST strictly translate the user's detailed script/flow into FSM nodes exactly as written, preserving all branches, sub-behaviors, and conditions. DO NOT use generic 'If Completed -> Go to state [end_call]' placeholders unless the user explicitly requested a simple linear flow." : "You must generate the complete call flow spanning ALL specified stages in detail. Do NOT summarize the logic into a single generic end step. Detail all extraction points, conditional branches, and sub-behaviors."}
6. REGISTERED TOOLS ONLY: You may only invoke tools from this list: ${JSON.stringify(registeredToolNames)}. Do not invent tools.
7. SLOT NAMING & TOOLS: 'slotsToCollect' must be 1-2 words (e.g. 'phone_number', 'booking_date'). CRITICAL: If a state collects a date, time, or phone number, YOU MUST explicitly include the field in the 'slotsToCollect' array (e.g. ['booking_date']).
8. SYSTEM VARIABLES: The variables 'current_day', 'current_date', and 'current_time' are reserved system variables. They MUST NOT be shortened, renamed, or modified under any circumstances. When collecting scheduling details, you must instruct the agent to use {{current_day}}, {{current_date}} and {{current_time}} as reference points.
9. VARIABLE USAGE & HALLUCINATION (CRITICAL): You MUST incorporate the defined pre-call infields (using '{{variable_name}}' syntax) into your FSM state objectives or speech prompts where appropriate. YOU ARE STRICTLY FORBIDDEN from inventing, guessing, or hallucinating variables that are not explicitly provided in 'Known Pre-Call Infields' or 'Required Extractions'. Do NOT invent redundant variants (e.g. do not invent 'customer_name' if 'name' is provided).

Generate the strict JSON array of FSM state nodes now.`;

    try {
      if ((spec.callFlowPlan?.userDefinedSteps?.length ?? 0) > 0 || (spec.callFlowPlan as any)?.fsmStates?.length > 0) {
        return (spec.callFlowPlan as any).fsmStates || spec.callFlowPlan?.userDefinedSteps;
      }

      const response = await geminiClient.generate({
        systemInstruction: `You are a structured JSON FSM planning specialist. Return ONLY a valid JSON array of FsmStateNode objects.`,
        prompt,
        responseMimeType: "application/json"
      });
      let parsed = safeParseJson(response.text, fallbackStates);
      
      let nodes: any[] = Array.isArray(parsed) && parsed.length >= 2 ? parsed : [];

      if (nodes.length === 0) {
        if (requiredStages && requiredStages.length > 0) {
          nodes = requiredStages.map((s: any) => ({
            id: s.id || `stage_${Math.random().toString(36).substr(2, 6)}`,
            objective: s.label || s.id || "Execute required stage",
            transitions: [{ condition: "Completed", nextState: "end_call" }]
          }));
          nodes.push({
            id: "end_call",
            objective: "Close the call",
            entryAction: { tool: "end_call", args: {}, speechPrompt: "Thank you, goodbye." },
            transitions: []
          });
        } else {
          nodes = fallbackStates;
        }
      }

      // Sanitize nodes
      nodes.forEach((node: any) => {
        if (!node.id) node.id = `state_${Math.random().toString(36).substr(2, 6)}`;
        if (node.slotsToCollect) {
          node.slotsToCollect = semanticDedupSlots(node.slotsToCollect.filter((slot: string) => !isDerivedSlot(slot)));
        }
      });
      
      return nodes;
    } catch (err) {
      logger.warn("WorkflowArchitect fallback triggered", err);
      if (requiredStages && requiredStages.length > 0) {
        const nodes = requiredStages.map((s: any) => ({
          id: s.id || `stage_${Math.random().toString(36).substr(2, 6)}`,
          objective: s.label || s.id || "Execute required stage",
          transitions: [{ condition: "Completed", nextState: "end_call" }]
        }));
        nodes.push({
          id: "end_call",
          objective: "Close the call",
          entryAction: { tool: "end_call", args: {}, speechPrompt: "Thank you, goodbye." },
          transitions: []
        });
        return nodes;
      }
      return fallbackStates;
    }
  }
}
