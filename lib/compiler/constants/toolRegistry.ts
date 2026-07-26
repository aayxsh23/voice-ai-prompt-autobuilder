/**
 * The canonical tool registry. These definitions are the single source of truth for
 * BOTH what gets registered with the telephony platform (via ToolPlanner ->
 * draft.suggestedFunctions -> PlatformAdapter) and the invocation syntax rendered
 * into the prompt's "Required Tool Actions".
 *
 * The prompt deliberately does NOT redeclare these definitions — the platform already
 * holds them. It only spells out *usage* at the point of need, built from the schemas
 * below so parameter names can never drift out of sync.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  associatedStateId?: string;
  usageProtocol?: string;
}

export const SYSTEM_RUNTIME_TOOLS: ToolDefinition[] = [
  {
    name: "validate_digit_input",
    description: "Validate phone number or pin-code digits from a spoken user turn, including partial input and repeated STT fragments.",
    parameters: {
      type: "object",
      properties: {
        field: { type: "string", description: "Human-readable field name: whatsapp, pin, or mobile_number." },
        expected_digits: { type: "integer", description: "Required digit count, typically 10 for phone numbers or 6 for pin codes." },
        user_text: { type: "string", description: "Latest customer utterance." },
        previously_collected: { type: "string", description: "ALL digits collected so far in previous turns for this field. Leave empty only when starting fresh." }
      },
      required: ["field", "expected_digits", "user_text"]
    },
    associatedStateId: "global_runtime"
  },
  {
    name: "set_capture_mode",
    description: "Toggle whether user speech captured while the bot was speaking is kept (true) or discarded (false). Enable before asking for digits/email/pin; disable after field is confirmed.",
    parameters: {
      type: "object",
      properties: {
        keep_buffer: { type: "boolean", description: "True to retain user audio during bot speech; false to drop it." },
        mode: { type: "string", enum: ["digits", "email"], description: "Which kind of multi-turn capture is starting." },
        field: { type: "string", description: "When mode='digits', the field name." },
        expected_digits: { type: "integer", description: "When mode='digits', expected digit count." }
      },
      required: ["keep_buffer"]
    },
    associatedStateId: "global_runtime"
  },
  {
    name: "end_call",
    description: "End the voice call after the closing agent's one-shot terminal closing turn. Call this in the SAME turn as the closing phrase.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Standardized reason for outcome: success, declined, opt_out, callback_handoff, abusive_caller, language_barrier, out_of_scope, wrong_number." }
      },
      required: []
    },
    associatedStateId: "resolution",
    usageProtocol: `#### CALL TERMINATION PROTOCOL (end_call)
When the conversation reaches a terminal state or the user asks to disconnect, you MUST invoke the \`end_call\` tool synchronously in the EXACT SAME turn as your closing phrase. Do not wait for the user to respond to your goodbye.`
  }
];

export function getEmailTool(toneProfile?: string[]): ToolDefinition {
  const isNaturalOrFast = toneProfile?.some((t: string) => /fast|natural|conversational|empathetic/i.test(t));
  if (isNaturalOrFast) {
    return {
      name: "format_email_for_voice_no_comma",
      description: "Normalize a spoken or typed email ID and return TTS-friendly speech with tokens separated by spaces instead of commas.",
      parameters: {
        type: "object",
        properties: { email_text: { type: "string", description: "Email ID as heard from the customer." } },
        required: ["email_text"]
      },
      associatedStateId: "global_runtime",
      usageProtocol: `#### EMAIL NORMALIZATION PROTOCOL (format_email)
When collecting an email address, always pass the user's raw utterance into the email formatting tool. Read back the exact \`spoken_email\` string returned by the tool for confirmation. Do not attempt to spell out or format the email manually.`
    };
  }
  return {
    name: "format_email_for_voice",
    description: "Normalize a spoken or typed email ID and return TTS-friendly speech with pauses.",
    parameters: {
      type: "object",
      properties: { email_text: { type: "string", description: "Email ID as heard from the customer." } },
      required: ["email_text"]
    },
    associatedStateId: "global_runtime",
    usageProtocol: `#### EMAIL NORMALIZATION PROTOCOL (format_email)
When collecting an email address, always pass the user's raw utterance into the email formatting tool. Read back the exact \`spoken_email\` string returned by the tool for confirmation. Do not attempt to spell out or format the email manually.`
  };
}

/** A bare identifier (e.g. `caller_utterance`) rather than a quoted literal. */
export interface RawArg { raw: string }
export type ToolArgValue = string | number | boolean | RawArg;

function renderArgValue(v: ToolArgValue): string {
  if (v !== null && typeof v === 'object' && 'raw' in v) return v.raw;
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

/** True when `name` is a tool the platform actually has registered. */
export function isRegisteredTool(name: string, tools?: Array<{ name?: string }>): boolean {
  if (!name || !Array.isArray(tools)) return false;
  return tools.some(t => t?.name === name);
}

/**
 * Renders a call like `validate_digit_input(field: "whatsapp", expected_digits: 10)`.
 *
 * Argument names and ordering come from the registered tool's JSON Schema, so the
 * prompt can never invent or mis-name a parameter. Returns null when the tool is not
 * registered — callers must then emit nothing rather than instruct an unknown tool.
 */
export function buildToolInvocation(
  toolName: string,
  args: Record<string, ToolArgValue>,
  tools?: Array<{ name?: string; parameters?: { properties?: Record<string, unknown> } }>
): string | null {
  if (!isRegisteredTool(toolName, tools)) return null;
  const def = tools!.find(t => t?.name === toolName);
  const schemaProps = def?.parameters?.properties || {};
  const declared = Object.keys(schemaProps);

  // Follow schema order, and drop anything the schema does not declare.
  const ordered = declared.filter(k => k in args);
  const rendered = ordered.map(k => `${k}: ${renderArgValue(args[k])}`);
  return `${toolName}(${rendered.join(', ')})`;
}
