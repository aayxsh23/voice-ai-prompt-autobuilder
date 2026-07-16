import { PromptPackageDraft } from "@/lib/llm/types";

export type TargetPlatform = 'bland' | 'retell' | 'vapi' | 'generic';

export interface PlatformFormattedPayload {
  platform: TargetPlatform;
  systemPrompt: string;
  configPayload: Record<string, any>;
}

const EMPTY_SCHEMA = { type: 'object', properties: {} };

/** The tool's JSON Schema is the contract the platform registers. Falling back to an
 *  empty schema would silently strip every argument, so prefer the real one. */
function toolSchema(f: { parameters?: Record<string, unknown> }): Record<string, unknown> {
  return f.parameters && Object.keys(f.parameters).length > 0 ? f.parameters : EMPTY_SCHEMA;
}

export class PlatformAdapter {
  formatForPlatform(draft: PromptPackageDraft, platform: TargetPlatform = 'generic'): PlatformFormattedPayload {
    const fullPrompt = draft.finalPrompt || '';

    if (platform === 'bland') {
      return {
        platform: 'bland',
        systemPrompt: fullPrompt,
        configPayload: {
          prompt: fullPrompt,
          voice: "maya",
          max_duration: 30,
          record: true,
          interruption_threshold: 100,
          tools: (draft.suggestedFunctions || []).map(f => ({
            name: f.name,
            description: f.description,
            input_schema: toolSchema(f)
          }))
        }
      };
    }

    if (platform === 'retell') {
      return {
        platform: 'retell',
        systemPrompt: fullPrompt,
        configPayload: {
          agent_name: draft.primaryGoal || "Voice Assistant",
          response_engine: {
            type: "retell-llm",
            llm_id: "retell-llm-id"
          },
          general_prompt: fullPrompt,
          general_tools: (draft.suggestedFunctions || []).map(f => ({
            type: "custom",
            name: f.name,
            description: f.description,
            parameters: toolSchema(f)
          }))
        }
      };
    }

    if (platform === 'vapi') {
      return {
        platform: 'vapi',
        systemPrompt: fullPrompt,
        configPayload: {
          model: {
            provider: "openai",
            model: "gpt-4o",
            messages: [
              { role: "system", content: fullPrompt }
            ],
            functions: (draft.suggestedFunctions || []).map(f => ({
              name: f.name,
              description: f.description,
              parameters: toolSchema(f)
            }))
          }
        }
      };
    }

    return {
      platform: 'generic',
      systemPrompt: fullPrompt,
      configPayload: {
        rawMarkdown: fullPrompt,
        variables: draft.dynamicVariables || []
      }
    };
  }
}
