import { NextResponse } from 'next/server';
import { WorkflowState, GathererOutput } from '@/lib/pipeline/types';
import { LogicArchitect } from '@/lib/pipeline/agents/architect';
import { PolicyOptimizer } from '@/lib/pipeline/agents/optimizer';
import { MasterAssembler } from '@/lib/pipeline/agents/assembler';
import { TheJudge } from '@/lib/pipeline/agents/judge';
import { createHash } from 'crypto';
import { logger } from '@/lib/logger';

function generateHash(data: any): string {
  return createHash('md5').update(JSON.stringify(data)).digest('hex');
}

export async function POST(req: Request) {
  try {
    const { businessSpec } = await req.json();

    if (!businessSpec) {
      return NextResponse.json({ error: 'businessSpec is required' }, { status: 400 });
    }

    const gathererOutput: GathererOutput = { businessSpec };
    const compileInputHash = generateHash(businessSpec);

    let workflowState: WorkflowState = {
      compileInputHash,
      gathererOutput,
      architectOutput: null,
      optimizerOutput: null,
      assemblerOutput: null,
      judgeOutput: null,
      attempts: 0,
      maxAttempts: 3,
      lastFailedStage: null
    };

    while (workflowState.attempts < workflowState.maxAttempts) {
      workflowState.attempts++;
      logger.info(`Compile Loop Attempt ${workflowState.attempts}/${workflowState.maxAttempts}`);

      // 1. Logic Architect
      if (!workflowState.architectOutput) {
        workflowState.architectOutput = await LogicArchitect.planWorkflow(businessSpec);
      }

      // 2. Policy & Tool Optimizer
      if (!workflowState.optimizerOutput) {
        workflowState.optimizerOutput = await PolicyOptimizer.optimize({
          businessSpec,
          fsmStates: workflowState.architectOutput.fsmStates
        });
      }

      // 3. Master Assembler
      if (!workflowState.assemblerOutput) {
        workflowState.assemblerOutput = await MasterAssembler.assemble({
          businessSpec,
          fsmStates: workflowState.architectOutput.fsmStates,
          globalGuardrails: workflowState.optimizerOutput.globalGuardrails,
          tools: workflowState.optimizerOutput.tools
        });
      }

      // 4. The Judge
      workflowState.judgeOutput = await TheJudge.evaluate(businessSpec, workflowState.assemblerOutput);

      if (workflowState.judgeOutput.passed) {
        logger.info('Judge passed. Exiting compile loop.');
        break; // Success!
      } else {
        logger.warn('Judge failed', { issues: workflowState.judgeOutput.issues });
        
        // Nullify the culprit stage to force re-computation
        // Assuming we take the first issue's culprit
        const culprit = workflowState.judgeOutput.issues[0]?.culprit;
        workflowState.lastFailedStage = culprit;
        
        if (culprit === 'assembler') {
          workflowState.assemblerOutput = null;
        } else if (culprit === 'optimizer') {
          workflowState.optimizerOutput = null;
          workflowState.assemblerOutput = null; // cascading nullification
        } else if (culprit === 'architect') {
          workflowState.architectOutput = null;
          workflowState.optimizerOutput = null;
          workflowState.assemblerOutput = null;
        }
      }
    }

    if (!workflowState.judgeOutput?.passed && workflowState.attempts >= workflowState.maxAttempts) {
      logger.warn('Circuit breaker tripped. Max attempts reached.', { hash: compileInputHash });
    }

    return NextResponse.json({
      success: true,
      prompt: workflowState.assemblerOutput?.finalPrompt || '',
      judgeVerdict: workflowState.judgeOutput,
      attempts: workflowState.attempts
    });

  } catch (err: any) {
    logger.error('Compile orchestration failed', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
