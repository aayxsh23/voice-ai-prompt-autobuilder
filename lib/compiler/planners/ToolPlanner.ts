import { BusinessSpecification } from "@/lib/llm/types";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool } from "@/lib/compiler/constants/toolRegistry";

export class ToolPlanner {
  public static async planTools(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['tools']> {
    const meta = spec.meta || {} as any;
    const toneList = Array.isArray(meta.toneProfile) ? meta.toneProfile : [String(meta.toneProfile || "")];
    const emailTool = getEmailTool(toneList);
    const immutableSystemTools = [...SYSTEM_RUNTIME_TOOLS, emailTool];

    // Only return already available/configured tools; never generate new tools via LLM
    // or inject hardcoded fallbacks like transfer_call.
    const existingTools = Array.isArray(spec.tools)
      ? spec.tools.filter(t => t && t.name && !immutableSystemTools.some(s => s.name === t.name))
      : [];

    return [...immutableSystemTools, ...existingTools] as BusinessSpecification['tools'];
  }
}
