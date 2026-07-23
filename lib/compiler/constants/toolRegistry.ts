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
    associatedStateId: "global_runtime",
    usageProtocol: `#### NUMERIC CAPTURE PROTOCOL (validate_digit_input + set_capture_mode)
Applies to EVERY turn while a numeric field (phone, WhatsApp, PIN, OTP, passcode) is being collected. Do not improvise.

**RULE 1 — Enable capture BEFORE asking.** In the SAME turn the agent asks for the field, silently invoke \`set_capture_mode(keep_buffer=true, mode="digits", field=<field_name>, expected_digits=<N>)\` FIRST. Skipping this call leaves capture pointed at the previous field and desyncs every following turn — never skip it.

**RULE 2 — Mandatory validate on every reply.** While the field is active, before generating any spoken response, invoke \`validate_digit_input(field=<field_name>, expected_digits=<N>, user_text=<raw utterance>, previously_collected=<all digits so far>)\`. Never count or concatenate digits in text.

**RULE 3 — Response routing (based strictly on tool output):**
* **Partial (\`is_valid=false\`, \`digits_remaining > 0\`):** Speak only the tool's \`latest_spoken\` digits back — no filler, no summary. Stay in the state.
* **Complete (\`is_valid=true\`, \`remaining=0\`):** Read back the full \`spoken_digits\` from the tool output and ask for confirmation.
* **Too many (\`too_many=true\`):** Ask the caller to start the number over.
* **No digits / error:** Ask the caller to repeat the digits clearly.

**RULE 4 — Premature confirmation guard.** If the caller says "yes / done / that's it" WHILE \`digits_remaining > 0\`, do NOT advance. Ask for the remaining digits.

**RULE 5 — Mid-correction lock.** If the caller rejects a confirmed number or provides a new one, you MUST call \`set_capture_mode(keep_buffer=true, mode="digits", field=<field_name>, expected_digits=<N>)\` again BEFORE the next line, then treat the field as fresh (empty \`previously_collected\`). Stay on the field until CONFIRMED — do not advance and do not claim the field is updated until a NEW value is collected and confirmed.

**RULE 6 — Exit.** Only after the caller confirms AND \`is_valid=true\`: invoke \`set_capture_mode(keep_buffer=false)\` and route to the next state.

**RULE 7 — Resume after detour.** After any interruption, greeting, connectivity check, language switch, unrelated question, or objection: find the last unfinished action for this field and resume there. Restart the capture only if the caller explicitly rejects or replaces the value.`
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
    associatedStateId: "global_runtime",
    // Paired mechanism with validate_digit_input; a single shared protocol covers both
    // to avoid rendering the same rules twice. resolveProtocols dedupes by identity.
    usageProtocol: `#### BUFFER MANAGEMENT (set_capture_mode)
Paired with \`validate_digit_input\` — see NUMERIC CAPTURE PROTOCOL for the full execution rules. Also used for email capture (mode="email") — enable in the same turn the agent asks for the email, and disable after \`format_email\` confirms.`
  },
  {
    name: "end_call",
    description: "End the voice call after the closing agent's one-shot terminal closing turn. Call this in the SAME turn as the closing phrase.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Optional short reason such as goodbye, wrong_number, refusal, or verification_complete." }
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

// ── Region-aware defaults ───────────────────────────────────────────────────
//
// Keyed by SCHEMA PARAMETER SEMANTICS, not by tool name — so any future tool
// that declares an `expected_digits` param inherits the same resolution logic.
// The compiler consults this table only for parameters the LLM did not supply.

const PHONE_DIGITS_BY_REGION: Record<string, number> = {
  IN: 10, US: 10, CA: 10, GB: 10, QA: 8, AE: 9, SA: 9, SG: 8, AU: 9,
};

const PIN_DIGITS_BY_REGION: Record<string, number> = {
  IN: 6, US: 5, GB: 6, QA: 5, AE: 5, SA: 5,
};

/** Detect intent from a slot/field name generically, without domain terms. */
function classifyFieldKind(name: string): 'phone' | 'pin' | 'otp' | 'email' | null {
  const n = (name || '').toLowerCase();
  if (/phone|mobile|whatsapp|contact_?number|telephone/.test(n)) return 'phone';
  if (/postal|pin[_ ]?code|zip|zipcode/.test(n)) return 'pin';
  if (/otp|passcode|verification[_ ]?code|security[_ ]?code/.test(n)) return 'otp';
  if (/email|mail/.test(n)) return 'email';
  return null;
}

/**
 * Fills in region-correct + slot-derived arguments the LLM did not supply.
 *
 * The LLM is instructed (WorkflowArchitect rule #10) to leave `args` empty for
 * common runtime tools — this function bridges that by combining:
 *   1. `existingArgs` (LLM-supplied, wins)
 *   2. `stateSlot` (the field name from the state that owns the tool call)
 *   3. Region-aware defaults keyed on parameter semantics
 *
 * Result: `set_capture_mode(keep_buffer=true, mode="digits", field="whatsapp", expected_digits=10)`
 * emerges automatically from `entryAction: { tool: "set_capture_mode" }` on a state
 * whose `slotsToCollect[0] === "whatsapp"` in a region-QA deployment.
 */
export function hydrateToolArgs(
  toolName: string,
  existingArgs: Record<string, ToolArgValue> | undefined,
  ctx: { stateSlot?: string; region?: string; onEntry?: boolean },
): Record<string, ToolArgValue> {
  const args: Record<string, ToolArgValue> = { ...(existingArgs || {}) };
  const slot = ctx.stateSlot || '';
  const kind = classifyFieldKind(slot);
  const region = (ctx.region || '').toUpperCase();

  // `field` — the slot the state is collecting.
  if (!('field' in args) && slot) args.field = slot;

  // `expected_digits` — region- and kind-dependent.
  if (!('expected_digits' in args) && kind) {
    const digits = kind === 'phone' ? PHONE_DIGITS_BY_REGION[region]
      : kind === 'pin' ? PIN_DIGITS_BY_REGION[region]
      : kind === 'otp' ? 6
      : undefined;
    if (digits) args.expected_digits = digits;
  }

  // set_capture_mode-specific: entry turns on the buffer, exit turns it off. When
  // callers use { onEntry: false } the tool is being invoked to close capture.
  if (toolName === 'set_capture_mode') {
    if (!('keep_buffer' in args)) args.keep_buffer = ctx.onEntry !== false;
    if (!('mode' in args) && kind) {
      args.mode = kind === 'email' ? 'email' : 'digits';
    }
  }

  // validate_digit_input: standard runtime placeholders for the two inputs the
  // agent must fill at execution time.
  if (toolName === 'validate_digit_input') {
    if (!('user_text' in args)) args.user_text = { raw: '<latest_user_utterance>' };
    if (!('previously_collected' in args)) args.previously_collected = { raw: '<digits_so_far>' };
  }

  return args;
}

/**
 * Convenience: hydrate args THEN build the invocation string. Used by the
 * assembler when rendering an FSM state's entry/in-turn tool call.
 */
export function buildHydratedInvocation(
  toolName: string,
  existingArgs: Record<string, ToolArgValue> | undefined,
  ctx: { stateSlot?: string; region?: string; onEntry?: boolean },
  tools?: Array<{ name?: string; parameters?: { properties?: Record<string, unknown> } }>,
): string | null {
  return buildToolInvocation(toolName, hydrateToolArgs(toolName, existingArgs, ctx), tools);
}
