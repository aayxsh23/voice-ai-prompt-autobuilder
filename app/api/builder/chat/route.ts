// app/api/builder/chat/route.ts

import { NextResponse } from 'next/server';
import { getLlmClient } from '@/lib/llm/llmClient';
import { BusinessExtractor } from '@/lib/compiler/blueprint/BusinessExtractor';
import { IntentExtractor } from '@/lib/compiler/blueprint/IntentExtractor';
import { EntityExtractor } from '@/lib/compiler/blueprint/EntityExtractor';
import { executePromptCompilationPipeline } from '@/lib/pipeline/promptCompiler';
import { VoiceAgentIR } from '@/lib/compiler/ir/IntermediateRepresentation';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, currentBlueprint } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const llm = getLlmClient();
    const result = await llm.generateBuilderChatReply(messages, currentBlueprint || {});

    // Run extraction layer under the hood to programmatically build VoiceAgentIR
    try {
      const bizExtractor = new BusinessExtractor();
      const intentExtractor = new IntentExtractor();
      const entityExtractor = new EntityExtractor();

      const [bizData, statesData, slotsData] = await Promise.all([
        bizExtractor.extract(messages),
        intentExtractor.extract(messages),
        entityExtractor.extract(messages)
      ]);

      const extractedIR: VoiceAgentIR = {
        meta: {
          agentName: bizData.agentName,
          companyName: bizData.companyName,
          role: bizData.role,
          toneProfile: bizData.toneProfile,
          contextScope: bizData.contextScope,
          languageVariant: bizData.languageVariant
        },
        context: bizData.context || [],
        states: statesData,
        slots: slotsData,
        tools: []
      };

      result.extractedBlueprint = {
        ...(result.extractedBlueprint || {}),
        extractedIR,
        business: {
          ...(result.extractedBlueprint?.business || {}),
          businessName: bizData.companyName,
          companyName: bizData.companyName,
          description: bizData.contextScope,
          valueProposition: bizData.contextScope
        },
        mission: {
          ...(result.extractedBlueprint?.mission || {}),
          primaryGoal: bizData.role
        },
        personality: {
          ...(result.extractedBlueprint?.personality || {}),
          tone: bizData.toneProfile?.[0] || "Professional",
          languageVariant: bizData.languageVariant || "English"
        }
      };

      // If requirements fulfilled, pre-compile system prompt cleanly
      if (result.isReadyToGenerate || statesData.length >= 2) {
        const compiledSystemPrompt = await executePromptCompilationPipeline(extractedIR);
        (result.extractedBlueprint as any).compiledSystemPrompt = compiledSystemPrompt;
      }
    } catch (extractionError) {
      console.warn("Under-the-hood IR extraction warning:", extractionError);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in /api/builder/chat:', error);
    return NextResponse.json({ error: error.message || 'Failed to process chat turn' }, { status: 500 });
  }
}
