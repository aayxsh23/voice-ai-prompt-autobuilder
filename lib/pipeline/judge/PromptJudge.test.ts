import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { judgePrompt, repairFromJudge } from './PromptJudge';
import { compilePromptPackage } from '../promptCompiler';
import * as llmClientModule from '@/lib/llm/llmClient';
import { LanguagePolicy } from '@/lib/llm/language/LanguagePolicy';
import { BusinessSpecification } from '@/lib/llm/types';
import { WorkflowArchitect } from '@/lib/compiler/planners/WorkflowArchitect';
import { KnowledgeArchitect } from '@/lib/compiler/planners/KnowledgeArchitect';
import { ToolPlanner } from '@/lib/compiler/planners/ToolPlanner';
import { llmClient as qwenLlmClient } from '@/lib/llm/qwenProvider';
import { prisma } from '@/lib/db';
import { JUDGE_MAX_ROUNDS } from '@/lib/config';

describe('PromptJudge & Transcript-Aware Compilation Pipeline', () => {
  const baseSpec: BusinessSpecification = {
    meta: {
      companyName: 'TestCorp',
      agentName: 'TestAgent',
      industry: 'Consulting',
      isRegulated: false,
      primaryGoal: 'Assist callers and schedule appointments',
      languageMode: 'english',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      toneProfile: ['Professional']
    },
    businessSnapshot: {
      operatingHours: '9am-5pm',
      servicesOffered: ['Consulting'],
      policies: {
        cancellation: '24 hours',
        refunds: 'No refunds',
        escalationNumbers: ['555-0100']
      }
    },
    callFlowPlan: {
      fsmStates: [
        { id: 'GREETING', objective: 'Greet caller', slotsToCollect: [], transitions: [], entryAction: { tool: 'speak', args: {}, speechPrompt: 'Say hello' } }
      ]
    },
    knowledgeBase: { faqs: [], objections: [] },
    tools: []
  };

  // Includes the safety section because every assembled prompt has one — the
  // safety_block_present contract correctly rejects a prompt without it.
  const cleanEnglishPrompt = `### AGENT IDENTITY & ROLE
You are an AI assistant for TestCorp. Your primary goal is to assist callers and schedule appointments.

### MANDATORY EMERGENCY & SAFETY OVERRIDES
- Always direct the user to their local emergency services.

### CALL FLOW
#### GREETING
Say: "Hello! Welcome to TestCorp. How can I assist you with scheduling an appointment today?"`;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
      generateRaw: vi.fn().mockResolvedValue(''),
      generate: vi.fn().mockResolvedValue({ text: '' }),
      generateJson: vi.fn().mockResolvedValue([])
    } as any);
    vi.spyOn(qwenLlmClient, 'generate').mockResolvedValue({ text: '[]' } as any);
    vi.spyOn(WorkflowArchitect, 'planWorkflow').mockResolvedValue([
      { id: 'GREETING', objective: 'Greet caller', slotsToCollect: [], transitions: [], entryAction: { tool: 'speak', args: {}, speechPrompt: 'नमस्ते, TestCorp में आपका स्वागत है।' } }
    ]);
    vi.spyOn(KnowledgeArchitect, 'planKnowledge').mockResolvedValue({
      faqs: [{ question: 'समय क्या है?', answer: 'सुबह 9 से शाम 5 बजे तक।' }],
      objections: []
    });
    vi.spyOn(ToolPlanner, 'planTools').mockResolvedValue([]);
    vi.spyOn(prisma.promptRule, 'findMany').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Fixture: Hinglish intent + English prompt -> deterministic backstop emits language/critical without needing LLM', async () => {
    const policy: LanguagePolicy = {
      mode: 'hinglish',
      script: 'latin',
      formality: 'aap',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      isHindiOrHinglish: true,
      mayUseHindi: true
    };

    const report = await judgePrompt({
      transcript: [{ role: 'user', content: 'We need a Hinglish voice agent.' }],
      finalPrompt: cleanEnglishPrompt,
      spec: { ...baseSpec, meta: { ...baseSpec.meta, languageMode: 'hinglish' } },
      policy
    });

    expect(report.verdict).toBe('fail');
    expect(report.blockingCount).toBeGreaterThanOrEqual(1);
    const langCritical = report.issues.find(i => i.category === 'language' && i.severity === 'critical');
    expect(langCritical).toBeDefined();
    expect(langCritical?.description).toContain('Hinglish mode');
  });

  it('2. "User said never quote fees" + prompt quotes fees -> emits incorrect/major', async () => {
    const policy: LanguagePolicy = {
      mode: 'english',
      script: 'latin',
      formality: 'aap',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      isHindiOrHinglish: false,
      mayUseHindi: false
    };

    const promptWithFees = cleanEnglishPrompt + `\nSay: "Our consulting fee is $150 per hour."`;

    const report = await judgePrompt({
      transcript: [{ role: 'user', content: 'Please never quote fees over the phone, our sales team handles pricing.' }],
      finalPrompt: promptWithFees,
      spec: baseSpec,
      policy
    });

    const feeIssue = report.issues.find(i => i.category === 'incorrect' && i.severity === 'major');
    expect(feeIssue).toBeDefined();
    expect(feeIssue?.description).toContain('never quote fees');
  });

  it('3. Invented address not in context -> detected as extra/major via LLM judge audit', async () => {
    const policy: LanguagePolicy = {
      mode: 'english',
      script: 'latin',
      formality: 'aap',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      isHindiOrHinglish: false,
      mayUseHindi: false
    };

    vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
      generateRaw: vi.fn().mockResolvedValue(JSON.stringify({
        verdict: 'pass',
        score: 90,
        issues: [
          {
            severity: 'major',
            category: 'extra',
            description: 'Prompt states office address as 123 Fake St, which was never mentioned in the user interview context.',
            evidenceFromConversation: 'User never provided a physical office address.',
            whereInPrompt: 'Contact Information section',
            suggestedFix: 'Remove the invented office address from the prompt or ask the caller to check our website for location details.'
          }
        ]
      })),
      generateReviewDraft: vi.fn().mockResolvedValue({
        agentIdentity: "Test Agent Identity",
        callFlowSteps: [],
        faqCards: [],
        objectionCards: [],
        finalPrompt: cleanEnglishPrompt
      }),
      generate: vi.fn().mockResolvedValue({ text: '' }),
      generateJson: vi.fn().mockResolvedValue([])
    } as any);

    const report = await judgePrompt({
      transcript: [{ role: 'user', content: 'We are a remote consulting company.' }],
      finalPrompt: cleanEnglishPrompt + `\nOur office is located at 123 Fake St.`,
      spec: baseSpec,
      policy
    });

    const extraIssue = report.issues.find(i => i.category === 'extra' && i.severity === 'major');
    expect(extraIssue).toBeDefined();
    expect(extraIssue?.description).toContain('123 Fake St');
  });

  it('4. Clean prompt -> pass verdict, score 100, 0 issues', async () => {
    const policy: LanguagePolicy = {
      mode: 'english',
      script: 'latin',
      formality: 'aap',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      isHindiOrHinglish: false,
      mayUseHindi: false
    };

    vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
      generateRaw: vi.fn().mockResolvedValue(JSON.stringify({
        verdict: 'pass',
        score: 100,
        issues: []
      })),
      generateReviewDraft: vi.fn().mockResolvedValue({
        agentIdentity: "Test Agent Identity",
        callFlowSteps: [],
        faqCards: [],
        objectionCards: [],
        finalPrompt: cleanEnglishPrompt
      }),
      generate: vi.fn().mockResolvedValue({ text: '' }),
      generateJson: vi.fn().mockResolvedValue([])
    } as any);

    const report = await judgePrompt({
      transcript: [{ role: 'user', content: 'We need an English appointment scheduling agent.' }],
      finalPrompt: cleanEnglishPrompt,
      spec: baseSpec,
      policy
    });

    expect(report.verdict).toBe('pass');
    expect(report.score).toBe(100);
    expect(report.issues.length).toBe(0);
    expect(report.blockingCount).toBe(0);
  });

  it('5. Loop caps at JUDGE_MAX_ROUNDS: force a judge that never passes -> stops at the cap, keeps best-so-far, sets requiresHumanReview = true', async () => {
    let judgeCallCount = 0;
    let repairCallCount = 0;

    vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
      generateRaw: vi.fn().mockImplementation(async (promptText: string) => {
        if (promptText.includes('Quality/Security check') || promptText.includes('You are a strict, highly accurate quality control judge')) {
          judgeCallCount++;
          // Generate strictly decreasing major issues along with 1 critical issue so score strictly improves each round (35 -> 45 -> 55 -> 65) but never reaches pass
          const majorIssues = Array.from({ length: 5 - judgeCallCount }, (_, i) => ({
            severity: 'major',
            category: 'incorrect',
            description: `Major issue ${i + 1} at round ${judgeCallCount}`,
            whereInPrompt: 'Section',
            suggestedFix: 'Fix it'
          }));
          return JSON.stringify({
            verdict: 'fail',
            score: 35,
            issues: [
              {
                severity: 'critical',
                category: 'language',
                description: 'Critical issue persisting across rounds.',
                whereInPrompt: 'Say lines',
                suggestedFix: 'Resolve critical issue.'
              },
              ...majorIssues
            ]
          });
        } else if (promptText.includes('expert Voice AI prompt repair specialist')) {
          repairCallCount++;
          const currentPrompt = promptText.split('CURRENT PROMPT:\n')[1] || cleanEnglishPrompt;
          return currentPrompt + `\n### REPAIRED_ROUND_${repairCallCount}\nSay: "Updated dialogue."`;
        }
        return '';
      }),
      generateReviewDraft: vi.fn().mockResolvedValue({
        agentIdentity: "Test Agent Identity",
        callFlowSteps: [],
        faqCards: [],
        objectionCards: [],
        finalPrompt: cleanEnglishPrompt
      }),
      generate: vi.fn().mockResolvedValue({ text: '' }),
      generateJson: vi.fn().mockResolvedValue([])
    } as any);

    const input = {
      businessSpec: {
        ...baseSpec,
        meta: { ...baseSpec.meta, languageMode: 'english' }
      },
      transcript: [{ role: 'user', content: 'Need agent.' }]
    };

    const draft = await compilePromptPackage(input as any);

    // Initial judge pass (round 0) + one judge per repair round. Asserted against the
    // configured cap rather than a literal, so tuning JUDGE_MAX_ROUNDS cannot silently
    // break the "never gets stuck" guarantee this test exists to protect.
    expect(judgeCallCount).toBe(JUDGE_MAX_ROUNDS + 1);
    expect(repairCallCount).toBe(JUDGE_MAX_ROUNDS);
    expect(draft.judgeReport?.blockingCount).toBeGreaterThan(0);
    expect(draft.requiresHumanReview).toBe(true);
    expect(draft.validationErrors?.some(e => e.includes('[Judge - CRITICAL]'))).toBe(true);
  });

  it('6. Anti-thrash: repair that does not improve score -> stops loop after single repair iteration', async () => {
    let judgeCalls = 0;
    vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
      generateRaw: vi.fn().mockImplementation(async (promptText: string) => {
        if (promptText.includes('You are a strict, highly accurate quality control judge')) {
          judgeCalls++;
          if (judgeCalls === 1) {
            // Initial judge score 35 (1 critical + 4 major issues: 100 - 25 - 40 = 35)
            return JSON.stringify({
              verdict: 'fail',
              score: 35,
              issues: [
                { severity: 'critical', category: 'language', description: 'Critical issue', whereInPrompt: 'Section', suggestedFix: 'Fix it' },
                { severity: 'major', category: 'incorrect', description: 'Issue 1', whereInPrompt: 'Section', suggestedFix: 'Fix 1' },
                { severity: 'major', category: 'incorrect', description: 'Issue 2', whereInPrompt: 'Section', suggestedFix: 'Fix 2' },
                { severity: 'major', category: 'incorrect', description: 'Issue 3', whereInPrompt: 'Section', suggestedFix: 'Fix 3' },
                { severity: 'major', category: 'incorrect', description: 'Issue 4', whereInPrompt: 'Section', suggestedFix: 'Fix 4' }
              ]
            });
          } else {
            // Second judge call (after repair 1) score drops: 25 (1 critical + 5 major issues: 100 - 25 - 50 = 25)
            return JSON.stringify({
              verdict: 'fail',
              score: 25,
              issues: [
                { severity: 'critical', category: 'language', description: 'Critical issue', whereInPrompt: 'Section', suggestedFix: 'Fix it' },
                { severity: 'major', category: 'incorrect', description: 'Issue 1', whereInPrompt: 'Section', suggestedFix: 'Fix 1' },
                { severity: 'major', category: 'incorrect', description: 'Issue 2', whereInPrompt: 'Section', suggestedFix: 'Fix 2' },
                { severity: 'major', category: 'incorrect', description: 'Issue 3', whereInPrompt: 'Section', suggestedFix: 'Fix 3' },
                { severity: 'major', category: 'incorrect', description: 'Issue 4', whereInPrompt: 'Section', suggestedFix: 'Fix 4' },
                { severity: 'major', category: 'incorrect', description: 'Issue 5 new', whereInPrompt: 'Section', suggestedFix: 'Fix 5' }
              ]
            });
          }
        } else if (promptText.includes('expert Voice AI prompt repair specialist')) {
          const currentPrompt = promptText.split('CURRENT PROMPT:\n')[1] || cleanEnglishPrompt;
          return currentPrompt + `\n### ATTEMPTED_REPAIR\nSay: "Hello."`;
        }
        return '';
      }),
      generateReviewDraft: vi.fn().mockResolvedValue({
        agentIdentity: "Test Agent Identity",
        callFlowSteps: [],
        faqCards: [],
        objectionCards: [],
        finalPrompt: cleanEnglishPrompt
      }),
      generate: vi.fn().mockResolvedValue({ text: '' }),
      generateJson: vi.fn().mockResolvedValue([])
    } as any);

    const input = {
      businessSpec: {
        ...baseSpec,
        meta: { ...baseSpec.meta, languageMode: 'english' }
      },
      transcript: [{ role: 'user', content: 'English agent please.' }]
    };

    const draft = await compilePromptPackage(input as any);

    // Initial check (1) + after 1 repair check (2). Because new score (25) <= old score (35), anti-thrash stops immediately!
    expect(judgeCalls).toBe(2);
    // Draft preserves the best prompt so far (round 0 score 35)
    console.log('ISSUES IN TEST 6:', draft.judgeReport?.issues);
    expect(draft.judgeReport?.score).toBe(35);
  });

  describe('LLM call configuration (regression: silent judge failure)', () => {
    const policy: LanguagePolicy = {
      mode: 'english',
      script: 'latin',
      formality: 'aap',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      isHindiOrHinglish: false,
      mayUseHindi: false
    };

    // The judge asks for JSON, but the provider only infers JSON mode from the phrases
    // "ONLY valid JSON"/"JSON matching". Without an explicit flag it ran with the
    // prose-authoring system prompt ("No JSON wrapping...") and no response_format, so
    // its reply never parsed and every audit silently fell back to pass/100/no-issues.
    it('requests JSON mode explicitly and does not use the prompt-authoring system prompt', async () => {
      const generateRaw = vi.fn().mockResolvedValue(JSON.stringify({ verdict: 'pass', score: 100, issues: [] }));
      vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({ generateRaw } as any);

      await judgePrompt({
        transcript: [{ role: 'user', content: 'English agent please.' }],
        finalPrompt: cleanEnglishPrompt,
        spec: baseSpec,
        policy
      });

      expect(generateRaw).toHaveBeenCalledTimes(1);
      const [, , options] = generateRaw.mock.calls[0];
      expect(options?.json).toBe(true);
      expect(options?.systemInstruction).toMatch(/quality-control judge/i);
      expect(options?.systemInstruction).not.toMatch(/No JSON wrapping/i);
    });

    it('parses a real LLM judge payload into issues once JSON mode is on', async () => {
      const generateRaw = vi.fn().mockResolvedValue(JSON.stringify({
        verdict: 'fail',
        score: 60,
        issues: [{
          severity: 'major',
          category: 'missing',
          description: 'User asked for a callback option but the prompt never offers one.',
          evidenceFromConversation: 'User: always offer a callback if we are busy.',
          whereInPrompt: 'absent',
          suggestedFix: 'Add a callback offer to the closing state.'
        }]
      }));
      vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({ generateRaw } as any);

      const report = await judgePrompt({
        transcript: [{ role: 'user', content: 'Always offer a callback if we are busy.' }],
        finalPrompt: cleanEnglishPrompt,
        spec: baseSpec,
        policy
      });

      expect(report.issues.some(i => i.category === 'missing' && /callback/i.test(i.description))).toBe(true);
    });

    // repairFromJudge is an edit pass; the authoring system prompt would tell it to
    // re-author the prompt from a mandated section list instead of fixing only what
    // was listed.
    it('repairFromJudge uses the neutral editor system prompt, not JSON mode', async () => {
      const generateRaw = vi.fn().mockResolvedValue('### AGENT IDENTITY & ROLE\nrepaired');
      vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({ generateRaw } as any);

      await repairFromJudge({
        finalPrompt: cleanEnglishPrompt,
        report: {
          verdict: 'fail',
          score: 50,
          blockingCount: 1,
          issues: [{
            severity: 'critical',
            category: 'language',
            description: 'Wrong language',
            evidenceFromConversation: 'User asked for Hinglish',
            whereInPrompt: 'Say lines',
            suggestedFix: 'Translate to Hinglish'
          }]
        },
        policy
      });

      expect(generateRaw).toHaveBeenCalledTimes(1);
      const [, , options] = generateRaw.mock.calls[0];
      expect(options?.json).toBe(false);
      expect(options?.systemInstruction).toMatch(/precise editor/i);
      expect(options?.systemInstruction).not.toMatch(/AGENT IDENTITY & PERSONA/);
    });
  });

  // validateCoherence reads the goal from draft.primaryGoal / ir.meta.primaryGoal.
  // The judge passed `{}` as the draft and a BusinessSpecification as `ir`, whose goal
  // lives at meta.primaryGoal — so the goal resolved to "" and the check never ran.
  describe('primary-goal coverage check (regression: dead code)', () => {
    const policy: LanguagePolicy = {
      mode: 'english',
      script: 'latin',
      formality: 'aap',
      targetTTS: 'ElevenLabs',
      aiDisclosure: 'disclose',
      agentGender: 'female',
      isHindiOrHinglish: false,
      mayUseHindi: false
    };

    beforeEach(() => {
      vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
        generateRaw: vi.fn().mockResolvedValue(JSON.stringify({ verdict: 'pass', score: 100, issues: [] }))
      } as any);
    });

    // The old keyword-based goal check was removed: the assembler always renders
    // "- Primary Goal: <goal>" verbatim, so it could never fail on a real prompt.
    // stage_coverage is its replacement and CAN detect a goal the flow never
    // implements — the VLCC missing-pitch bug.
    it('flags a required stage the flow never implements', async () => {
      const spec = {
        ...baseSpec,
        callFlowPlan: {
          steps: [{ sequenceOrder: 1, stateId: 'opening', stateName: 'Opening', scriptDirective: 'Say: "Hi"', slotsToCollect: [] }],
          requiredStages: [{ id: 'opening', label: 'Opening' }, { id: 'cross_sell_pitch', label: 'Cross-sell pitch' }],
        },
      } as unknown as BusinessSpecification;

      const report = await judgePrompt({
        transcript: [{ role: 'user', content: 'Pitch Beauty to Slimming customers.' }],
        finalPrompt: cleanEnglishPrompt + '\nSTATE: [opening] (Opening)',
        spec,
        policy
      });

      const gap = report.issues.find(i => i.category === 'coverage' && /Cross-sell pitch/.test(i.description));
      expect(gap).toBeDefined();
      expect(gap?.severity).toBe('critical');
    });

    it('does not flag coverage when every required stage has a state', async () => {
      const spec = {
        ...baseSpec,
        callFlowPlan: {
          steps: [
            { sequenceOrder: 1, stateId: 'opening', stateName: 'Opening', scriptDirective: 'Say: "Hi"', slotsToCollect: [] },
            { sequenceOrder: 2, stateId: 'cross_sell_pitch', stateName: 'Pitch', scriptDirective: 'Say: "May I share something?"', slotsToCollect: [] },
          ],
          requiredStages: [{ id: 'opening', label: 'Opening' }, { id: 'cross_sell_pitch', label: 'Cross-sell pitch' }],
        },
      } as unknown as BusinessSpecification;

      const report = await judgePrompt({
        transcript: [{ role: 'user', content: 'Pitch Beauty to Slimming customers.' }],
        finalPrompt: cleanEnglishPrompt + '\nSTATE: [opening] (Opening)\nSTATE: [cross_sell_pitch] (Pitch)',
        spec,
        policy
      });

      expect(report.issues.some(i => i.category === 'coverage')).toBe(false);
    });

    // A missing stage cannot be fixed by editing prompt text — the flow is generated
    // from spec.callFlowPlan.steps, so a text edit would desync spec and prompt. This
    // is why a dropped stage previously had to be patched by hand.
    it('repairs a missing stage structurally by re-planning the flow', async () => {
      vi.spyOn(llmClientModule, 'getLlmClient').mockReturnValue({
        generateRaw: vi.fn().mockResolvedValue(JSON.stringify({ verdict: 'pass', score: 100, issues: [] })),
        generateReviewDraft: vi.fn().mockResolvedValue({
          callFlowSteps: [], faqCards: [], objectionCards: [], dynamicVariables: [],
        }),
      } as any);

      vi.spyOn(WorkflowArchitect, 'planWorkflow').mockResolvedValue([
        { id: 'opening', objective: 'Greet caller', slotsToCollect: [], transitions: [], entryAction: { tool: 'speak', args: {}, speechPrompt: 'Hi' } },
        { id: 'cross_sell_pitch', objective: 'Pitch', slotsToCollect: [], transitions: [], entryAction: { tool: 'speak', args: {}, speechPrompt: 'May I share?' } },
      ] as any);

      const input = {
        businessSpec: {
          ...baseSpec,
          callFlowPlan: {
            steps: [],
            requiredStages: [{ id: 'opening', label: 'Opening' }, { id: 'cross_sell_pitch', label: 'Cross-sell pitch' }],
          },
        },
        transcript: [{ role: 'user', content: 'Pitch Beauty to Slimming customers.' }],
      };

      const draft = await compilePromptPackage(input as any);
      const states = (draft.businessSpec?.callFlowPlan?.fsmStates || []).map(s => s.id);
      expect(states.length).toBeGreaterThan(0);
      expect(states).toContain('cross_sell_pitch');
      expect(draft.finalPrompt).toContain('cross_sell_pitch');
    });

    // Regression: the judge used to carry its own copy of these rules, so a contract
    // added for CI never protected production.
    it('runs the shared contracts (locale) in production, not just in CI', async () => {
      const report = await judgePrompt({
        transcript: [],
        finalPrompt: cleanEnglishPrompt + '\n- call 911 for immediate danger',
        spec: baseSpec,
        policy
      });
      expect(report.issues.some(i => i.category === 'locale' && i.severity === 'critical')).toBe(true);
    });
  });
});
