import { BusinessSpecification } from "@/lib/llm/types";
import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class WorkflowArchitect {
  public static async planWorkflow(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['callFlowPlan']['steps']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;

    const fallbackSteps = [
      {
        sequenceOrder: 1,
        stateId: "greeting",
        stateName: "Greeting & Verification",
        scriptDirective: `Say: "Hello, calling from ${meta.companyName || 'our desk'}. How may I assist you today?"`,
        slotsToCollect: [],
        isFallback: true
      },
      {
        sequenceOrder: 2,
        stateId: "requirement_collection",
        stateName: "Requirement Collection",
        scriptDirective: `Say: "I can assist with ${meta.primaryGoal || 'your request'}. Could you please provide your details?"`,
        slotsToCollect: ["caller_intent"],
        isFallback: true
      },
      {
        sequenceOrder: 3,
        stateId: "resolution",
        stateName: "Resolution & Next Steps",
        scriptDirective: `Say: "Let me process that for you and confirm the next steps."`,
        slotsToCollect: [],
        isFallback: true
      }
    ];

    const prompt = `You are a WorkflowArchitect specializing in designing deterministic voice AI call flow state machines.
Given the following business metadata and operating snapshot, output a JSON array of steps for the callFlowPlan.

Business Meta:
${JSON.stringify(meta, null, 2)}

Business Snapshot:
${JSON.stringify(snap, null, 2)}

Return a JSON array of objects with:
- sequenceOrder (number starting at 1)
- stateId (lowercase snake_case identifier)
- stateName (human readable state name)
- scriptDirective (exact directive or dialogue instruction using Say: "...")
- slotsToCollect (string array of slot names required in this state)`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: "You are a structured JSON workflow planning specialist. Return ONLY a valid JSON array of steps.",
        prompt
      });
      const steps = safeParseJson(response.text, fallbackSteps);
      return Array.isArray(steps) && steps.length > 0 ? steps : fallbackSteps;
    } catch (err) {
      console.warn("WorkflowArchitect fallback triggered:", err);
      return fallbackSteps;
    }
  }
}
