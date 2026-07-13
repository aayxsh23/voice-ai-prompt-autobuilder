import { BusinessSpecification } from "@/lib/llm/types";
import { llmClient as geminiClient } from "@/lib/llm/qwenProvider";
import { safeParseJson } from "@/lib/llm/types";
import { logger } from "@/lib/logger";

const SYSTEM_RUNTIME_TOOLS = [
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
        reason: { type: "string", description: "Optional short reason such as goodbye, wrong_number, refusal, or verification_complete." }
      },
      required: []
    },
    associatedStateId: "resolution"
  }
];

function getEmailTool(toneProfile?: string[]) {
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
      associatedStateId: "global_runtime"
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
    associatedStateId: "global_runtime"
  };
}

export class ToolPlanner {
  public static async planTools(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['tools']> {
    const meta = spec.meta || {} as any;
    const toneList = Array.isArray(meta.toneProfile) ? meta.toneProfile : [String(meta.toneProfile || "")];
    const emailTool = getEmailTool(toneList);
    const immutableSystemTools = [...SYSTEM_RUNTIME_TOOLS, emailTool];

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
Given the following business specification and call flow steps, determine what domain-specific business tools (e.g., calendar booking, SMS sending, lookup, transfer) are needed. Do NOT return system tools like end_call or validate_digit_input.

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
        prompt,
        responseMimeType: "application/json"
      });
      const parsed = safeParseJson(response.text, fallbackTools);
      const rawDomainTools = Array.isArray(parsed) ? parsed : (parsed && Array.isArray((parsed as any).tools) ? (parsed as any).tools : fallbackTools);
      const domainTools = rawDomainTools.filter((t: any) => t && t.name && !immutableSystemTools.some(s => s.name === t.name));

      return [...immutableSystemTools, ...domainTools];
    } catch (err) {
      logger.warn("ToolPlanner fallback triggered", err);
      return [...immutableSystemTools, ...fallbackTools];
    }
  }
}
