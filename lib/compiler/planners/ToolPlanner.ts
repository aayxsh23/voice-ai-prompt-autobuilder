import { BusinessSpecification } from "@/lib/llm/types";
import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class ToolPlanner {
  public static async planTools(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['tools']> {
    const meta = spec.meta || {} as any;
    const steps = spec.callFlowPlan?.steps || [];

    const fallbackTools = [
      {
        name: "transfer_call",
        description: "Transfers the caller to a human representative or specialist.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Reason for call escalation" },
            department: { type: "string", description: "Target department for transfer" }
          },
          required: ["reason"]
        },
        associatedStateId: steps.length > 0 ? steps[steps.length - 1].stateId : "resolution"
      }
    ];

    const prompt = `You are a ToolPlanner specializing in determining required API tools and structuring their schemas for Voice AI agents.
Given the following business specification and call flow steps, determine what tools (e.g., calendar booking, SMS sending, lookup, transfer) are needed.

Business Spec:
${JSON.stringify({ meta, steps }, null, 2)}

Return a JSON array of tool objects with:
- name (string identifier)
- description (clear explanation of when to call the tool)
- parameters (JSON Schema object defining properties and required parameters)
- associatedStateId (the stateId from call flow steps where this tool should be triggered)`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are a tool definition architect. Return ONLY a valid JSON array of tool objects.",
        prompt
      });
      const tools = safeParseJson(response.text, fallbackTools);
      return Array.isArray(tools) && tools.length > 0 ? tools : fallbackTools;
    } catch (err) {
      console.warn("ToolPlanner fallback triggered:", err);
      return fallbackTools;
    }
  }
}
