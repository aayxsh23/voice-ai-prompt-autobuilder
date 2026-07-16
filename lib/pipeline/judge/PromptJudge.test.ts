import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { judgePrompt, repairFromJudge } from './PromptJudge';
import { compilePromptPackage } from '../promptCompiler';
import * as llmClientModule from '@/lib/llm/llmClient';
import { LanguagePolicy } from '@/lib/llm/language/LanguagePolicy';
import { ChatMessage, BusinessSpecification } from '@/lib/llm/types';
import { WorkflowArchitect } from '@/lib/compiler/planners/WorkflowArchitect';
import { KnowledgeArchitect } from '@/lib/compiler/planners/KnowledgeArchitect';
import { ToolPlanner } from '@/lib/compiler/planners/ToolPlanner';
import { llmClient as qwenLlmClient } from '@/lib/llm/qwenProvider';
import { prisma } from '@/lib/db';

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
      steps: [
        { sequenceOrder: 1, stateId: 'GREETING', stateName: 'Greeting', objective: 'Greet caller', scriptDirective: 'Say hello', slotsToCollect: [] }
      ]
    },
    knowledgeBase: { faqs: [], objections: [] },
    tools: []
  };

  const cleanEnglishPrompt = `### AGENT IDENTITY & ROLE
You are an AI assistant for TestCorp. Your primary goal is to assist callers and schedule appointments.

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
      { sequenceOrder: 1, stateId: 'GREETING', stateName: 'Greeting', objective: 'Greet caller', slotsToCollect: [], scriptDirective: 'नमस्ते, TestCorp में आपका स्वागत है।' }
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

  it('5. Loop caps at JUDGE_MAX_ROUNDS (3): force a judge that never passes -> stops after 3 rounds, keeps best-so-far, sets requiresHumanReview = true', async () => {
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

    // Initial judge pass (round 0) + 3 repair loops = 4 judge calls total, 3 repair calls
    expect(judgeCallCount).toBe(4);
    expect(repairCallCount).toBe(3);
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
    expect(draft.judgeReport?.score).toBe(35);
  });
});
