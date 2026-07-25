import { BusinessSpecification, safeParseJson } from "@/lib/llm/types";
import { llmClient } from "@/lib/llm/llmProvider";
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
        edges: [
          { condition: "Identity verified / ready to proceed", targetStateId: "capture_intent" },
          { condition: "Wrong number / caller busy", targetStateId: "end_call", speechPrompt: "I will call back later. Goodbye." }
        ]
      },
      {
        id: "capture_intent",
        objective: "Capture caller intent and route accordingly.",
        slotsToCollect: ["caller_intent"],
        edges: [
          { condition: "Intent provided", targetStateId: "confirmation_readback" }
        ]
      },
      {
        id: "confirmation_readback",
        objective: "Read back and confirm all collected details before closing.",
        slotsToCollect: [],
        edges: [
          { condition: "Caller confirms accuracy", targetStateId: "end_call" },
          { condition: "Caller wants to modify details", targetStateId: "capture_intent" }
        ]
      },
      {
        id: "end_call",
        objective: "Close the call politely.",
        slotsToCollect: [],
        entryAction: { tool: "end_call", args: {}, speechPrompt: "Thank you for your time. Have a great day!" },
        edges: []
      }
    ];

    const langDirective = isHindiOrHinglish
      ? `\nLANGUAGE DIRECTIVE: Write all 'speechPrompt' lines inside the FSM nodes in Devanagari script (देवनागरी) Hindi. English terminology should be romanized.`
      : "";

    const prompt = `You are a WorkflowArchitect specializing in designing robust voice AI call flow state machines using a Graph-Based FSM topology.
Given the business goal, metadata, and operational topics, design a comprehensive, multi-step Finite State Machine (FSM).${langDirective}

BUSINESS SNAPSHOT:
- **Company Name:** ${meta.companyName || "N/A"}
- **Agent Persona:** ${meta.agentName || "Voice Assistant"} (${meta.agentGender || "female"}, Tone: ${Array.isArray(meta.toneProfile) ? meta.toneProfile.join(', ') : (meta.toneProfile || "Professional")})
- **Primary Goal:** ${primaryGoal}
- **Operating Hours:** ${snap.operatingHours || "N/A"}
- **Services:** ${snap.servicesOffered?.join(', ') || "N/A"}
- **Call Direction:** ${isInbound ? "INBOUND (Customer calls us)" : "OUTBOUND (We call customer)"}
${spec.callFlowPlan?.script || spec.callFlowPlan?.steps?.length ? `\nUSER-DEFINED CALL FLOW LOGIC (CRITICAL):\nThe user has explicitly defined the following logic/steps. You MUST strictly follow this routing, branching, and these spoken actions when generating the FSM state nodes. If the user provided conditional conversational logic (e.g. 'if X, pitch Y', or specific cross-selling rules), you MUST preserve this exact conditional logic (using edges, notes, or closeVariants). Do NOT simplify or replace the logic with generic variables.\n${spec.callFlowPlan.script || JSON.stringify(spec.callFlowPlan.steps, null, 2)}\n` : ""}

CONTEXT VARIABLES & EXTRACTIONS:
${infieldsList.length > 0 ? `Known Pre-Call Infields (Available before call): ${JSON.stringify(infieldsList.map((v: any) => v.key))}\n` : ""}
${existingSlots.size > 0 ? `Required Extractions (Must collect these slots): ${JSON.stringify(Array.from(existingSlots))}\n` : ""}
${requiredStages.length > 0 ? `MANDATORY STAGES: ${JSON.stringify(requiredStages)}\n` : ""}

MANDATORY STATE MACHINE DESIGN RULES:
1. OUTPUT FORMAT: Return ONLY a valid JSON array of FsmStateNode objects.
2. GRAPH TOPOLOGY: The FSM is a directed graph, NOT a linear pipeline. Design states to be REUSABLE:
   - Create shared utility states (e.g., one 'escalation' state, one 'confirmation_readback' state) reachable from MULTIPLE other states via edges.
   - Allow IN-PLACE correction loops: the confirmation/readback state should NOT route back to the collection state for minor corrections. It MUST use a 'subLoop' to update the field and repeat the read-back within the SAME state. Only route out of the state if the correction fails repeatedly.
   - Allow early termination: EVERY non-greeting state must have an edge to 'end_call' for when the caller wants to disconnect.
   - Allow re-entry: if verification fails, route back to the verification state, don't create a separate "re-verify" state.
3. FSM NODE SCHEMA:
   {
     "id": "STEP_1_GREETING",
     "objective": "Clear description of what this state achieves",
     "slotsToCollect": ["field_a_category", "field_b_id"],
     "orderIndependent": true,
     "optional": false,
     "skipCondition": "User already provided info",
     "maxTurns": 3,
     "retryPolicy": {
       "maxAttempts": 2,
       "onExhausted": {
         "targetStateId": "ESCALATION_STATE"
       }
     },
     "subLoop": {
       "selfLoop": true,
       "triggerCondition": "User corrects previous input"
     },
     "closeVariants": [
       { "variant": "success", "script": "Thank you, your booking is confirmed." },
       { "variant": "declined", "script": "No problem, thank you for your time." },
       { "variant": "opt_out", "script": "I understand, we will remove you from our list." },
       { "variant": "callback_handoff", "script": "Our team will call you back shortly." }
     ],
     "direction": "agent calls customer",
     "terminal": false,
     "spoken": true,
     "notes": ["Ensure the user has their documentation ready before proceeding."],
     "speechPrompt": "Optional: Specific phrase to speak if no tool is invoked.",
     "entryAction": {
       "tool": "tool_name",
       "args": { "param_name": "value" }
     },
     "inTurnTool": {
       "tool": "tool_name",
       "args": { "param_name": "value" }
     },
     "edges": [
       { "condition": "valid=true", "targetStateId": "STEP_2", "closeVariant": "success" }
     ]
   }
4. STATE CONSOLIDATION: NEVER create separate states for error handling, silence rephrase, or segment clarification. These are handled WITHIN the parent state's retryPolicy and subLoop. A state that ONLY handles an error condition of another state is ALWAYS wrong.
   - Group ALL related data collection into the MINIMUM number of states.
   - A single state with slotsToCollect: ['center', 'date', 'time'] and orderIndependent: true is ALWAYS preferred over three separate states.
5. FLEXIBLE VALIDATION: For data types with variable formats (phone numbers, locations, dates), add a notes entry instructing the agent to accept reasonable variations. Never reject input outright — confirm with the caller instead.
6. CALL DIRECTION & IDENTITY:
   - If Inbound: State 1 MUST greet and ask how to help.
   - If Outbound: State 1 MUST introduce the agent and verify the caller's identity.
   - AI DISCLOSURE: ${denyAiDisclosure ? "DO NOT disclose AI identity. Present as a human." : "Proactively disclose that the agent is an AI."}
7. ROUTING & EDGES: Every state MUST have edges indicating how to proceed based on conditions. The final state MUST use 'end_call' as its id and invoke the 'end_call' tool. For the closing state (or any state preceding end_call), you MUST provide distinct closeVariants for different outcomes (e.g., success, declined, opt_out, callback_handoff) so the agent's sign-off matches the actual conversation outcome (e.g. not saying 'see you soon' to someone who opted out).
8. REGISTERED TOOLS ONLY: You may only invoke tools from this list: ${JSON.stringify(registeredToolNames)}. Do not invent tools.
9. SLOT NAMING & TOOLS: 'slotsToCollect' must be 1-2 words (e.g. 'phone_number', 'booking_date').
10. DEEP TOOL INJECTION: Do NOT hardcode generic arguments (e.g., expected_digits) into tool invocations. Simply specify the "tool" name in entryAction or inTurnTool. The compiler will map the appropriate robust, region-aware parameters dynamically.
11. VARIABLE FORMATTING: You must explicitly distinguish between variables. All pre-fed infield variables MUST be wrapped in double curly braces (e.g. {{customer_name}}). All variables collected during the call (extracted slots) MUST be wrapped in single square brackets (e.g. [booking_date]). Do not mix these up.

Generate the strict JSON array of FSM state nodes now.`;

    try {
      if ((spec.callFlowPlan?.userDefinedSteps?.length ?? 0) > 0 || (spec.callFlowPlan as any)?.fsmStates?.length > 0) {
        return (spec.callFlowPlan as any).fsmStates || spec.callFlowPlan?.userDefinedSteps;
      }

      const response = await llmClient.generate({
        systemInstruction: `You are a structured JSON FSM planning specialist. Return ONLY a valid JSON array of FsmStateNode objects.`,
        prompt,
        responseMimeType: "application/json"
      });
      let parsed = safeParseJson(response.text, fallbackStates);
      
      if (!parsed || !Array.isArray(parsed) || parsed.length < 1) {
        logger.warn('WorkflowArchitect FSM generation failed or returned empty states. Falling back to default template.');
        parsed = fallbackStates;
      }

      let nodes = parsed;

      // Safety net: collapse bloated error/silence states into their parent
      const toRemove = new Set<string>();
      nodes.forEach((node: any) => {
        if ((!node.slotsToCollect || node.slotsToCollect.length === 0) && /rephrase|retry|clarify|silence|error/i.test(node.id + " " + node.objective)) {
          const parents = nodes.filter((p: any) => p.edges?.some((e: any) => e.targetStateId === node.id));
          if (parents.length === 1) {
            const parent = parents[0];
            toRemove.add(node.id);
            if (!parent.subLoop) {
              parent.subLoop = { selfLoop: true, triggerCondition: "Error/Silence/Clarification" };
            }
            parent.edges = parent.edges.filter((e: any) => e.targetStateId !== node.id);
          }
        }
      });
      nodes = nodes.filter((n: any) => !toRemove.has(n.id));

      // Infields propagation: append unreferenced infields to the first state
      const declaredInfields = infieldsList.map((v: any) => v.key).filter(Boolean);
      for (const key of declaredInfields) {
        const isReferenced = nodes.some((node: any) => {
          const str = JSON.stringify({
            objective: node.objective,
            speechPrompt: node.speechPrompt,
            slotsToCollect: node.slotsToCollect,
          });
          return str.includes(key);
        });
        if (!isReferenced && nodes.length > 0) {
          nodes[0].notes = nodes[0].notes || [];
          nodes[0].notes.push(`Personalize using {{${key}}}`);
        }
      }

      // Post-processing and sanitization
      nodes.forEach((node: any) => {
        if (!node.id) node.id = `state_${Math.random().toString(36).substr(2, 6)}`;
        if (node.slotsToCollect) {
          node.slotsToCollect = semanticDedupSlots(node.slotsToCollect.filter((slot: string) => !isDerivedSlot(slot)));
        }
        
        // Auto-populate skip conditions and order-independence
        if (Array.isArray(node.slotsToCollect) && node.slotsToCollect.length > 0) {
          if (!node.skipCondition) {
            node.skipCondition = `All fields (${node.slotsToCollect.join(', ')}) already provided in prior turns`;
          }
          if (node.slotsToCollect.length > 1 && node.orderIndependent === undefined) {
            node.orderIndependent = true;
          }
        }
      });
      
      return nodes;
    } catch (err) {
      logger.warn("WorkflowArchitect fallback triggered", err);
      return fallbackStates;
    }
  }
}
