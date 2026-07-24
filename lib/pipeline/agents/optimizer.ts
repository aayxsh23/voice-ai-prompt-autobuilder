import { OptimizerInput, OptimizerOutput, ClassifiedTopic, ToolDefinition } from "../types";
import { safeParseJson } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool } from "@/lib/compiler/constants/toolRegistry";
import { logger } from "@/lib/logger";

export class PolicyOptimizer {
  public static async optimize(input: OptimizerInput): Promise<OptimizerOutput> {
    const { businessSpec, fsmStates } = input;
    const capturedTopics = businessSpec.capturedTopics || [];
    const meta = businessSpec.meta || {} as any;
    const toneListForTools = Array.isArray(meta.toneProfile) ? meta.toneProfile : [String(meta.toneProfile || "")];

    // Merge tools
    const registeredTools = Array.from(new Set([
      ...SYSTEM_RUNTIME_TOOLS,
      getEmailTool(toneListForTools),
      ...(Array.isArray(businessSpec.tools) ? businessSpec.tools : []),
    ])) as ToolDefinition[];

    if (capturedTopics.length === 0) {
      return {
        globalGuardrails: [],
        mappedStateNotes: {},
        mappedStateCloseVariants: {},
        tools: registeredTools
      };
    }

    const prompt = `You are a Policy & Tool Optimizer agent. 
Your task is to classify operational protocols (captured topics) to resolve token bloat and deduplicate rules.
For each captured topic, you must assign it exactly ONE of the following classifications:
- "pure-duplicate": The topic is entirely redundant and already covered by standard agent behaviors.
- "unique-global": The rule is unique, universally applicable (e.g. abusive user, hang up, audio drop, generic language switch, not_interested), and should be placed in the global RULES block.
- "stage-contextual": The rule is highly specific to a certain part of the flow (e.g. cross-sell pushback, service issue handling, opening phrase, closing scripts, retry exhaustion scripts, specific callbacks). You must also provide the "targetStateId" from the FSM states provided.
- "unique-fact": It is a fact that belongs in the Business Context, not an operational rule.

FSM STATES AVAILABLE:
${JSON.stringify(fsmStates.map(s => ({ id: s.id, objective: s.objective })), null, 2)}

CAPTURED TOPICS TO CLASSIFY:
${JSON.stringify(capturedTopics, null, 2)}

Return ONLY a JSON array of ClassifiedTopic objects matching this schema:
[{
  "topic": "topic_name",
  "classification": "stage-contextual",
  "targetStateId": "state_1",
  "content": "The actual rule content to map"
}]
`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are a Policy Optimizer. Return ONLY a valid JSON array of ClassifiedTopic objects.",
        prompt,
        responseMimeType: "application/json",
        temperature: 0
      });
      
      const classified: ClassifiedTopic[] = safeParseJson(response.text, []);
      
      const globalGuardrails: string[] = [];
      const mappedStateNotes: Record<string, string[]> = {};
      const mappedStateCloseVariants: Record<string, string[]> = {};

      classified.forEach(c => {
        if (c.classification === 'unique-global') {
          globalGuardrails.push(c.content);
        } else if (c.classification === 'stage-contextual' && c.targetStateId) {
          if (!mappedStateNotes[c.targetStateId]) mappedStateNotes[c.targetStateId] = [];
          mappedStateNotes[c.targetStateId].push(c.content);
        }
      });

      return {
        globalGuardrails,
        mappedStateNotes,
        mappedStateCloseVariants,
        tools: registeredTools
      };
    } catch (err) {
      logger.error("PolicyOptimizer classification failed", err);
      // Fallback: put everything into global
      return {
        globalGuardrails: capturedTopics.map(c => c.content),
        mappedStateNotes: {},
        mappedStateCloseVariants: {},
        tools: registeredTools
      };
    }
  }
}
