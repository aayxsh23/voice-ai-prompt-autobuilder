import { PromptPackageDraft } from "@/lib/llm/types";
import { MultiAgentManifest } from "@/lib/llm/types/MetaAgentSchemas";

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

      platform: 'generic',
      systemPrompt: fullPrompt,
      configPayload: {
        rawMarkdown: fullPrompt,
        variables: draft.dynamicVariables || []
      }
    };
  }

  formatMultiAgent(manifest: MultiAgentManifest, platform: TargetPlatform = 'vapi'): PlatformFormattedPayload {
    if (platform === 'vapi') {
      return {
        platform: 'vapi',
        systemPrompt: manifest.agents.find(a => a.role === 'router')?.systemPrompt || '',
        configPayload: {
          type: 'squad',
          members: manifest.agents.map(agent => ({
            role: agent.role,
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              messages: [{ role: 'system', content: agent.systemPrompt }],
              functions: (agent.tools || []).map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters
              }))
            },
            transitionConditions: agent.ownedStates.flatMap(s => 
              (s.edges || []).filter(e => e.targetAgent && e.targetAgent !== agent.role)
                     .map(e => ({ condition: e.condition, toRole: e.targetAgent }))
            )
          }))
        }
      };
    }
    
    // Fallback for non-multi-agent capable platforms, just dump router prompt for now
    const fallbackPrompt = manifest.agents.find(a => a.role === 'router')?.systemPrompt || 'Router Prompt Missing';
    return {
      platform,
      systemPrompt: fallbackPrompt,
      configPayload: { prompt: fallbackPrompt }
    };
  }
}
