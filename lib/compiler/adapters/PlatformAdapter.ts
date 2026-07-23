import { PromptPackageDraft } from "@/lib/llm/types";
import { MultiAgentManifest } from "@/lib/llm/types/MetaAgentSchemas";

export type TargetPlatform = 'custom';

export interface PlatformFormattedPayload {
  platform: TargetPlatform;
  systemPrompt: string;
  configPayload: Record<string, any>;
}

export class PlatformAdapter {
  formatForPlatform(draft: PromptPackageDraft): PlatformFormattedPayload {
    const fullPrompt = draft.finalPrompt || '';

    return {
      platform: 'custom',
      systemPrompt: fullPrompt,
      configPayload: {
        rawMarkdown: fullPrompt,
        variables: draft.dynamicVariables || []
      }
    };
  }

  formatMultiAgent(manifest: MultiAgentManifest): PlatformFormattedPayload {
    // For the custom platform, we simply pass through the full multi-agent manifest
    const routerPrompt = manifest.agents.find(a => a.role === 'router')?.systemPrompt || 'Router Prompt Missing';
    
    return {
      platform: 'custom',
      systemPrompt: routerPrompt,
      configPayload: { 
        manifest 
      }
    };
  }
}
