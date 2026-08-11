import { BusinessSpecification, safeParseJson } from "@/lib/llm/types";
import { llmClient } from "@/lib/llm/llmProvider";
import { FsmStateNode } from "@/lib/llm/types/CallFlowPlan";
import { semanticDedupSlots } from "@/lib/compiler/assembler/PromptAssembler";
import { isDerivedSlot } from "@/lib/compiler/constants/slotRegistry";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool } from "@/lib/compiler/constants/toolRegistry";
import { ScriptLinter } from "@/lib/compiler/utils/ScriptLinter";
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
        closeVariants: [
          { variant: "wrong_number", script: "I apologize, I must have the wrong number. Have a great day." },
          { variant: "opt_out", script: "I understand, I will remove you from our list and we won't call again. Goodbye." }
        ],
        edges: [
          { condition: "Identity verified / ready to proceed", targetStateId: "capture_intent" },
          { condition: "Wrong number / caller busy", targetStateId: "end_call", closeVariant: "wrong_number" },
          { condition: "Caller asks to stop calling / opt out", targetStateId: "end_call", closeVariant: "opt_out" }
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
      ? `\nLANGUAGE DIRECTIVE: Write 'speechPrompt' lines in natural, conversational ${languageMode === 'hinglish' ? 'Hinglish (mix of Hindi and English words, written in Devanagari script)' : 'Hindi (Devanagari script)'}. 
CRITICAL RULES FOR HINDI/HINGLISH:
1. NO NUMERIC DIGITS: Write all numbers as fully spelled-out words (e.g. write "दस" not "10"). NEVER output characters 0-9 in the script.
2. NO DEVANAGARI TRANSLITERATION OF ENGLISH: Any word of English origin MUST be written in Roman/English script. Do NOT write English words in Devanagari.`
      : `\nLANGUAGE DIRECTIVE: CRITICAL: Write all numbers as fully spelled-out words, NEVER use numeric digits (e.g., write "ten" not "10").`;

    const transferTopic = spec.capturedTopics?.find(t => t.topic === 'Live transfer & escalation');
    const escalationNumbers = spec.businessSnapshot?.policies?.escalationNumbers || [];
    const transferDestinations = escalationNumbers
      .map((n: string) => { const match = n.match(/^([^:]+):/); return match ? `"${match[1].trim()}"` : ''; })
      .filter(Boolean)
      .join(', ');

    let transferContext = '';
    if (registeredToolNames.includes('transfer_call') && transferTopic) {
      transferContext = `\nLIVE TRANSFER ENABLED:
The tool \`transfer_call\` is registered. Available destinations: [${transferDestinations}].
Transfer should be offered (with caller consent) based on these rules:
${transferTopic.summary}

TRANSFER RULES FOR FSM GENERATION:
- Generate a transfer consent state: offer the transfer, wait for consent, then fire the tool.
- The consent-ask itself fires no tool. Only fire \`transfer_call\` after a "yes."
- If the caller declines the transfer but has other intent, return them to the pending step.
- If transfer fails at runtime, the agent should fall back to a callback close using \`end_call\`.
- Generate appropriate terminal closeVariants for: transfer accepted, transfer declined, transfer failed.\n`;
    }

    const prompt = `You are a WorkflowArchitect specializing in designing robust voice AI call flow state machines using a Graph-Based FSM topology.
Given the business goal, metadata, and operational topics, design a comprehensive, multi-step Finite State Machine (FSM).${langDirective}

BUSINESS SNAPSHOT:
- **Company Name:** ${meta.companyName || "N/A"}
- **Agent Persona:** ${meta.agentName || "Voice Assistant"} (${meta.agentGender || "female"}, Tone: ${Array.isArray(meta.toneProfile) ? meta.toneProfile.join(', ') : (meta.toneProfile || "Professional")})
- **Primary Goal:** ${primaryGoal}
- **Operating Hours:** ${snap.operatingHours || "N/A"}
- **Services:** ${snap.servicesOffered?.join(', ') || "N/A"}
- **Call Direction:** ${isInbound ? "INBOUND (Customer calls us)" : "OUTBOUND (We call customer)"}
${spec.callFlowPlan?.script || spec.callFlowPlan?.steps?.length ? `\nUSER-DEFINED CALL FLOW LOGIC (CRITICAL):\nThe user has explicitly defined the following logic/steps. You MUST strictly follow this routing, branching, and these spoken actions when generating the FSM state nodes. If the user provided conditional conversational logic (e.g. 'if X, pitch Y', or specific cross-selling rules), you MUST preserve this exact conditional logic (using edges, notes, or closeVariants). Do NOT simplify or replace the logic with generic variables.\n${spec.callFlowPlan.script || JSON.stringify(spec.callFlowPlan.steps, null, 2)}\n` : ""}${transferContext}

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
7. ROUTING & EDGES: Every state MUST have edges indicating how to proceed based on conditions. The final state MUST use 'end_call' as its id and invoke the 'end_call' tool. For the closing state (or any state preceding end_call/transfer_call), you MUST provide distinct closeVariants for different outcomes (e.g., success, declined, opt_out, callback_handoff, transfer_accepted, transfer_declined, transfer_failed) so the agent's sign-off matches the actual conversation outcome (e.g. not saying 'see you soon' to someone who opted out).
8. REGISTERED TOOLS ONLY: You may only invoke tools from this list: ${JSON.stringify(registeredToolNames)}. Do not invent tools.
9. SLOT NAMING & TOOLS: 'slotsToCollect' must be 1-2 words (e.g. 'phone_number', 'booking_date').
10. DEEP TOOL INJECTION: Do NOT hardcode generic arguments (e.g., expected_digits) into tool invocations. Simply specify the "tool" name in entryAction or inTurnTool. The compiler will map the appropriate robust, region-aware parameters dynamically.
11. VARIABLE FORMATTING: You must explicitly distinguish between variables. All pre-fed infield variables MUST be wrapped in double curly braces (e.g. {{customer_name}}). All variables collected during the call (extracted slots) MUST be wrapped in single square brackets (e.g. [booking_date]). Do not mix these up.
12. EXACT MAPPING RULE: If MANDATORY STAGES are provided, you MUST use the exact string values from that list as the \`id\` or \`objective\` for the corresponding states, so downstream validators can map them.
13. DATA LOSS IN PARAPHRASING: You may paraphrase user scripts for natural conversational flow, but you MUST NOT DROP any specific instructions, facts, policies, disclosures (like call recording), or identity checks that the user provided in their script. If the user said 'confirm identity first', your generated speechPrompt MUST include a question confirming identity. If the user said 'state the call is recorded', your generated speechPrompt MUST state the call is recorded.
14. COMPLEX PUSHBACK ROUTING: If a specific branch requires a multi-step response (e.g., 'acknowledge -> note follow-up -> redirect once -> close if still declined'), you MUST encode this exactly using a combination of a \`subLoop\` (for the redirect) and a terminal \`edge\` (for the close). Do not simplify it to a single edge.
15. SYNC PROSE AND EDGES: If the user specified handling for objections, digressions, or edge cases (like 'customer busy' or 'why are you calling'), you MUST create explicit conditional edges or a subLoop in the relevant states to handle these paths structurally. Do not rely entirely on implicit LLM reasoning for explicit business rules.
16. END_CALL REASONS & TERMINAL TAXONOMY: When closing the call, you MUST provide exactly one of these standardized reasons for the outcome: success, declined, opt_out, callback_handoff, abusive_caller, language_barrier, out_of_scope, wrong_number. Your closeVariants SHOULD map to these terminal states (e.g., T-BOOKED -> success, T-CALLBACK -> callback_handoff, T-DEAD -> declined, T-WRONGNUM -> wrong_number, T-DNC -> opt_out). CRITICAL: If the business context implies outbound calling or lead generation, you MUST explicitly generate edges for "wrong number" and "ask to stop calling / opt out", mapped to the \`wrong_number\` and \`opt_out\` terminal reasons.
17. DATE/TIME VALIDATION: If a state collects a date or time slot, you MUST add specific constraints to its 'notes' array instructing the agent to: (1) Ask a clarifying question if a time is ambiguous (e.g., "12 बजे" without specifying AM/PM or दोपहर/रात). (2) Validate the proposed date/time strictly against the system variables {{current_date}} and {{current_time}} to reject past slots. (3) NEVER assert calendar availability or business claims (e.g., "we are very busy today") unless explicitly grounded in provided business context.
18. MANDATORY RETRY POLICIES: EVERY state that has a \`slotsToCollect\` array MUST include a \`retryPolicy\` with \`maxAttempts\` and an \`onExhausted\` target state. Do not leave capture states open-ended.
19. CONFIRMATION READ-BACK: If the overall flow collects 2 or more slots, you MUST include a dedicated confirmation state (id containing 'confirm' or 'readback') before the final resolution/booking step. This state must read back all collected details and allow the user to confirm or correct them via a subLoop.

Generate the strict JSON array of FsmStateNode now.`;

    try {
      if ((spec.callFlowPlan?.userDefinedSteps?.length ?? 0) > 0 || (spec.callFlowPlan as any)?.fsmStates?.length > 0) {
        return (spec.callFlowPlan as any).fsmStates || spec.callFlowPlan?.userDefinedSteps;
      }

      const response = await llmClient.generate({
        systemInstruction: `You are a structured JSON FSM planning specialist. Return ONLY a valid JSON array of FsmStateNode objects.`,
        prompt,
        responseMimeType: "application/json",
        contextLabel: "WorkflowArchitect",
        sessionId: meta.sessionId
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
      
      if (isHindiOrHinglish) {
        for (const node of nodes) {
          if (node.speechPrompt) {
            node.speechPrompt = await ScriptLinter.lintHindiScript(node.speechPrompt, meta.sessionId);
          }
          if (Array.isArray(node.closeVariants)) {
            for (const variant of node.closeVariants) {
              if (variant.script) {
                variant.script = await ScriptLinter.lintHindiScript(variant.script, meta.sessionId);
              }
            }
          }
        }
      }
      
      return nodes;
    } catch (err) {
      logger.warn("WorkflowArchitect fallback triggered", err);
      return fallbackStates;
    }
  }
}
