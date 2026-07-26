import { BusinessSpecification } from "@/lib/llm/types";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool, ToolDefinition } from "@/lib/compiler/constants/toolRegistry";
import { FsmStateNode } from "@/lib/llm/types/CallFlowPlan";
import { resolveSlotDigitSpec } from "@/lib/compiler/constants/slotRegistry";

export class ToolPlanner {
  /**
   * Plans tools for a prompt compilation, returning the system tools plus the user-provided tools.
   */
  public static async planTools(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['tools']> {
    const meta = spec.meta || {} as any;
    const toneList = Array.isArray(meta.toneProfile) ? meta.toneProfile : [String(meta.toneProfile || "")];
    
    // Always inject end_call (every flow terminates)
    const immutableSystemTools = [...SYSTEM_RUNTIME_TOOLS.filter(t => t.name === 'end_call')];
    
    const allSlots = Array.from(new Set<string>((spec.callFlowPlan?.fsmStates || []).flatMap((s: any) => Array.isArray(s?.slotsToCollect) ? s.slotsToCollect : (Array.isArray(s?.collectsVariable) ? s.collectsVariable : [])))).filter(Boolean);
    const hasEmailSlot = allSlots.some(s => resolveSlotDigitSpec(s)?.mode === 'email');
    const hasDigitSlot = allSlots.some(s => resolveSlotDigitSpec(s)?.mode === 'digits');
    
    if (hasDigitSlot) {
      const validateDigitTool = SYSTEM_RUNTIME_TOOLS.find(t => t.name === 'validate_digit_input');
      if (validateDigitTool) immutableSystemTools.push(validateDigitTool);
    }
    
    if (hasDigitSlot || hasEmailSlot) {
      const setCaptureModeTool = SYSTEM_RUNTIME_TOOLS.find(t => t.name === 'set_capture_mode');
      if (setCaptureModeTool) immutableSystemTools.push(setCaptureModeTool);
    }
    
    if (hasEmailSlot) {
      const emailTool = getEmailTool(toneList);
      immutableSystemTools.push(emailTool);
    }

    // Only return already available/configured tools; never generate new tools via LLM
    // or inject hardcoded fallbacks like transfer_call.
    const existingTools = Array.isArray(spec.tools)
      ? spec.tools.filter(t => t && t.name && !immutableSystemTools.some(s => s.name === t.name))
      : [];

    return [...immutableSystemTools, ...existingTools] as BusinessSpecification['tools'];
  }

  /**
   * Renders a prompt-friendly tool definition from the tool's JSON Schema.
   */
  public static describeToolForPrompt(tool: ToolDefinition, index: number): string {
    const props = tool.parameters?.properties || {};
    const required = new Set(tool.parameters?.required || []);
    const params = Object.entries(props).map(([name, schema]: [string, any]) => {
      const type = schema?.type || 'any';
      const desc = schema?.description ? ` — "${schema.description}"` : '';
      const req = required.has(name) ? '' : ' (optional)';
      return `${name}: ${type}${req}${desc}`;
    });
    
    let desc = `${index}. ${tool.name}\nPurpose: ${tool.description}\nUsage:`;
    if (params.length > 0) {
      desc += `\nParameters:\n- ${params.join('\n- ')}`;
    }
    
    if (tool.usageProtocol) {
      // Strip markdown headers from usageProtocol to fit nicely under Usage:
      const cleanUsage = tool.usageProtocol.replace(/^#+\s.*?\n/gm, '').trim();
      desc += `\n\n${cleanUsage}`;
    }
    return desc;
  }

  /**
   * Extracts robust numeric/email capture protocols to be placed in the prompt.
   */
  public static resolveProtocols(fsmStates: FsmStateNode[], tools: ToolDefinition[] = []): string[] {
    const protocols = new Set<string>();
    const activeTools = new Set<string>();

    for (const state of fsmStates) {
      if (state.inTurnTool) activeTools.add(state.inTurnTool.tool);
      if (state.entryAction) activeTools.add(state.entryAction.tool);
      
      // Implicit tools
      if (state.isTerminal || state.id === 'end_call' || state.id === 'resolution' || state.edges?.some(e => e.targetStateId === 'end_call' || e.action === 'end_call' || !e.targetStateId)) {
        activeTools.add('end_call');
      }
      
      const slots = state.slotsToCollect || [];
      if (slots.some(s => resolveSlotDigitSpec(s)?.mode === 'digits')) {
        activeTools.add('validate_digit_input');
        activeTools.add('set_capture_mode');
      }
      if (slots.some(s => resolveSlotDigitSpec(s)?.mode === 'email')) {
        activeTools.add('set_capture_mode');
        const emailToolName = tools.find(t => t.name.startsWith('format_email_'))?.name || 'format_email_for_voice';
        activeTools.add(emailToolName);
      }
    }

    for (const tool of tools) {
      if (activeTools.has(tool.name) && tool.usageProtocol) {
        protocols.add(tool.usageProtocol);
      }
    }

    return Array.from(protocols);
  }
}
