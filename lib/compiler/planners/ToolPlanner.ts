import { BusinessSpecification } from "@/lib/llm/types";
import { SYSTEM_RUNTIME_TOOLS, getEmailTool, ToolDefinition } from "@/lib/compiler/constants/toolRegistry";
import { FsmStateNode } from "@/lib/llm/types/CallFlowPlan";

export class ToolPlanner {
  /**
   * Plans tools for a prompt compilation, returning the system tools plus the user-provided tools.
   */
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

  /**
   * Renders a prompt-friendly tool definition from the tool's JSON Schema.
   * Example output:
   *   `validate_digit_input(field: string — "field name", expected_digits: integer — "digit count", ...)`
   */
  public static describeToolForPrompt(tool: ToolDefinition): string {
    const props = tool.parameters?.properties || {};
    const required = new Set(tool.parameters?.required || []);
    const params = Object.entries(props).map(([name, schema]: [string, any]) => {
      const type = schema?.type || 'any';
      const desc = schema?.description ? ` — "${schema.description}"` : '';
      const req = required.has(name) ? '' : ' (optional)';
      return `${name}: ${type}${req}${desc}`;
    });
    return `\`${tool.name}(${params.join(', ')})\` — ${tool.description}`;
  }

  /**
   * Extracts robust numeric/email capture protocols to be placed in the prompt.
   */
  public static resolveProtocols(fsmStates: FsmStateNode[]): string[] {
    const protocols = new Set<string>();
    for (const state of fsmStates) {
      if (state.inTurnTool?.tool === 'validate_digit_input' || state.entryAction?.tool === 'validate_digit_input') {
        const expected = state.inTurnTool?.args?.expected_digits || state.entryAction?.args?.expected_digits || 'X';
        const field = state.inTurnTool?.args?.field || state.entryAction?.args?.field || 'unknown';
        const protocol = `#### NUMERIC CAPTURE PROTOCOL — field="${field}", expected_digits=${expected}
This protocol governs EVERY turn while ${field} is being collected. Do not improvise.

**RULE 1 — Mandatory Tool-Call Gate:**
While active, a \`[RUNTIME DIGIT BUFFER]\` system note appears. You MUST execute \`validate_digit_input\` BEFORE generating any spoken response. Map the unmodified user utterance to \`user_text\` and buffer digits to \`previously_collected\`.

**RULE 2 — Response Routing (based strictly on tool output):**
* **Condition A (Partial Input) \`digits_remaining > 0\`:** Speak ONLY the \`latest_spoken\` digits. NEVER add conversational filler.
* **Condition B (Complete) \`valid=true\`, \`remaining=0\`:** Instantly read back the complete number using the \`spoken_digits\` tool output.
* **Condition C (Too Many Digits) \`too_many=true\`:** Inform the user there are too many digits and ask them to start over.
* **Condition D (No Digits / Error):** Ask the user to repeat the digits clearly.

**RULE 3 — Premature Confirmation Guard:**
If user says "Yes" / "done" WHILE tool state shows \`digits_remaining > 0\`: Do NOT advance. Respond by asking for the remaining digits.

**RULE 4 — Final Confirmation & Exit:**
* **User confirms AND \`valid=true\`:** Invoke \`set_capture_mode(keep_buffer=false)\` -> Route to next state.
* **User rejects:** Buffer auto-clears. Invoke \`set_capture_mode(keep_buffer=true, mode="digits", field="${field}", expected_digits=${expected})\` and ask to restart.
* **Awaiting-Confirmation Shadow State:** Buffer shows \`status=awaiting_confirmation\`. Number is already complete. Do NOT read back again.`;
        protocols.add(protocol);
      }
    }
    return Array.from(protocols);
  }
}
