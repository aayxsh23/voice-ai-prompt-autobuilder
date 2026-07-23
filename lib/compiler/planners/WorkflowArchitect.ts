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
2. GRAPH TOPOLOGY & OBJECTION HANDLING: The FSM is a directed graph, NOT a linear pipeline. Design states to be REUSABLE and MINIMAL:
   - Reactions to caller emotion or objection (not_interested, already_have_it, why_are_you_calling, upset, confused, wants_to_hang_up) are per-state EDGE CONDITIONS with an action verb, NOT dedicated states. Use edge \`action\` values like "acknowledge_and_close", "acknowledge_and_redirect", "rephrase", "escalate", "end_call". A state whose only purpose is to react to an emotion/objection is ALWAYS wrong — the global OBJECTION & ESCALATION POLICY (rendered above the state list) tells the agent HOW to handle each action verb uniformly.
   - You may create ONE shared "confirmation_readback" state reachable from every collection state; correction loops route BACK to the specific collection state the caller wants to fix.
   - Allow re-entry: if verification fails, route back to the verification state via \`retryPolicy.onExhausted.targetStateId\` — do NOT create a separate "re-verify" state.
   - Do NOT add "if caller upset / confused / not interested / wants to end" edges to every single state. State those globally once (they apply everywhere); only enumerate an edge on a state when its resolution differs from the global policy.
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
       { "variant": "success", "script": "Thank you, we are done here." }
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
7. ROUTING & EDGES: Every state MUST have edges indicating how to proceed based on conditions. The final state MUST use 'end_call' as its id and invoke the 'end_call' tool.
8. REGISTERED TOOLS ONLY: You may only invoke tools from this list: ${JSON.stringify(registeredToolNames)}. Do not invent tools.
9. SLOT NAMING & TOOLS: 'slotsToCollect' must be 1-2 words (e.g. 'phone_number', 'booking_date').
10. TOOL ARGS: For common runtime tools (set_capture_mode, validate_digit_input, format_email_*, end_call), specify only \`entryAction: { tool: "<name>" }\` or \`inTurnTool: { tool: "<name>" }\` — leave \`args\` empty. The compiler injects region-correct arguments (expected_digits by country, mode by field type, keep_buffer by entry vs. exit, field name from slotsToCollect[0]). Only pass explicit \`args\` when a schema-required parameter cannot be inferred from the state's slot or the deployment region (e.g. a business-specific enum on a domain tool).
11. VARIABLE FORMATTING: When referencing derived variables or slots (like dates, centers, numbers) inside \`speechPrompt\`, \`script\`, or \`closeVariants\`, you MUST wrap them in double square brackets like \`[[slot_name]]\` (e.g. \`[[date]]\`). If the user defined logic using curly braces like \`{date}\`, convert it to \`[[date]]\`. Do NOT use curly braces for derived variables.

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
      
      if (!parsed || !Array.isArray(parsed) || parsed.length < 1) {
        logger.warn('WorkflowArchitect FSM generation failed or returned empty states. Falling back to default template.');
        parsed = fallbackStates;
      }

      let nodes = parsed;

      // Handler-state collapse.
      //
      // We classify a node as a handler stub (a state whose only job is to react to
      // a caller emotion / objection / error) by SHAPE, not by id-regex. A state is
      // a handler stub when ALL of these hold:
      //   1. It has no slotsToCollect (nothing to collect from the caller).
      //   2. Its only outgoing edges terminate the call (route to end_call, or the
      //      final terminal state) or route back to a single collection state.
      //   3. It has no unique tool call other than end_call.
      //
      // When a handler stub is found, we rewrite every inbound edge to carry a
      // canonical action verb (acknowledge_and_close, escalate, rephrase) that the
      // assembler renders under the global OBJECTION and ESCALATION POLICY, and we
      // remove the handler node. Generic by construction — reacts to the state's
      // graph shape, so it catches any per-emotion / per-objection handler
      // regardless of naming.
      const terminalIds = new Set<string>(
        nodes.filter((n: any) => n.terminal || n.isTerminal || n.id === 'end_call' || n.entryAction?.tool === 'end_call').map((n: any) => n.id),
      );

      const classifyHandler = (node: any): { kind: 'close' | 'redirect' | 'rephrase'; redirectTo?: string } | null => {
        const slots = Array.isArray(node.slotsToCollect) ? node.slotsToCollect.length : 0;
        if (slots > 0) return null;
        const edges = Array.isArray(node.edges) ? node.edges : [];
        if (edges.length === 0) return null;

        // Only end_call / terminal targets => closer.
        const targets = edges.map((e: any) => e.targetStateId).filter(Boolean);
        const uniqueTargets = new Set<string>(targets);
        const allTerminal = targets.length > 0 && targets.every((t: string) => terminalIds.has(t) || t === 'end_call');
        if (allTerminal) return { kind: 'close' };

        // All edges point to the SAME single non-terminal state => a "rephrase then
        // return" pattern that belongs in the parent's subLoop.
        if (uniqueTargets.size === 1) {
          const only = targets[0];
          if (!terminalIds.has(only) && only !== 'end_call') return { kind: 'rephrase', redirectTo: only };
        }
        return null;
      };

      const removed = new Set<string>();
      const handlerActionById = new Map<string, { action: string; redirectTo?: string }>();
      nodes.forEach((node: any) => {
        const cls = classifyHandler(node);
        if (!cls) return;
        // Skip the canonical end_call terminal itself.
        if (terminalIds.has(node.id)) return;
        removed.add(node.id);
        if (cls.kind === 'close') {
          handlerActionById.set(node.id, { action: 'acknowledge_and_close' });
        } else if (cls.kind === 'rephrase') {
          handlerActionById.set(node.id, { action: 'rephrase_and_return', redirectTo: cls.redirectTo });
        }
      });

      // Rewrite every inbound edge that pointed at a removed handler into an action
      // verb (kept on the parent so the intent isn't lost), targeting either end_call
      // (for close) or the rephrase parent (for rephrase-and-return).
      nodes.forEach((node: any) => {
        if (!Array.isArray(node.edges)) return;
        node.edges = node.edges
          .map((e: any) => {
            const handler = e.targetStateId && handlerActionById.get(e.targetStateId);
            if (!handler) return e;
            const newTarget = handler.action === 'rephrase_and_return' ? (handler.redirectTo || node.id) : 'end_call';
            return { ...e, action: e.action || handler.action, targetStateId: newTarget };
          });
        // Collapse duplicate edges the rewrite may have produced.
        const seen = new Set<string>();
        node.edges = node.edges.filter((e: any) => {
          const key = String(e.condition) + '|' + String(e.targetStateId) + '|' + String(e.action || '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });

      nodes = nodes.filter((n: any) => !removed.has(n.id));

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
