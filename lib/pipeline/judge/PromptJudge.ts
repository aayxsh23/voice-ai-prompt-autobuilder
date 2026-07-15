import { JudgeReport, JudgeIssue } from "./types";
import { ChatMessage, BusinessSpecification, safeParseJson } from "@/lib/llm/types";
import { LanguagePolicy, containsDevanagari } from "@/lib/llm/language/LanguagePolicy";
import { validateLanguageQuality } from "@/lib/pipeline/validators/LanguageQualityValidator";
import { validateCoherence } from "@/lib/pipeline/validators/CoherenceValidator";
import { getLlmClient } from "@/lib/llm/llmClient";
import { logger } from "@/lib/logger";

const ROMANIZED_HINDI_CHECK = /\b(hai|hain|kya|aap|kar|rahi|raha|hoon|hun|nahi|haan|namaste|kaise|kripya|dhanyavaad|bataye|bataiye|kijiye|karein|chahiye|milega|milenge|sakti|sakta|acha|accha|theek|madad)\b/i;

export async function judgePrompt(a: {
  transcript: ChatMessage[];
  finalPrompt: string;
  spec: BusinessSpecification;
  policy: LanguagePolicy;
}): Promise<JudgeReport> {
  const issues: JudgeIssue[] = [];

  // 1. Deterministic Backstops (Free, fast, guaranteed)
  
  // (a) Language & Script check
  if (a.policy.isHindiOrHinglish || a.policy.script === 'devanagari') {
    const hasDevanagari = containsDevanagari(a.finalPrompt);
    const langQuality = validateLanguageQuality(a.finalPrompt, a.policy);

    if (a.policy.script === 'devanagari') {
      if (!hasDevanagari) {
        issues.push({
          severity: 'critical',
          category: 'language',
          description: `User requested ${a.policy.mode} mode (${a.policy.script} script), but agent dialogue and instructions are written in pure English/Latin.`,
          evidenceFromConversation: `User configured language mode as ${a.policy.mode} with ${a.policy.targetTTS} TTS.`,
          whereInPrompt: 'Spoken dialogue across all call flow states',
          suggestedFix: `Translate all agent dialogue (Say: lines and state instructions) into ${a.policy.mode} using ${a.policy.script} script. Keep English domain terms (demo, software, email, WhatsApp) in Latin script.`
        });
      } else if (langQuality.warnings && langQuality.warnings.length > 0) {
        for (const warn of langQuality.warnings) {
          if (warn.includes('Romanized Hindi in a Devanagari line') || warn.includes('more romanized-Hindi line')) {
            issues.push({
              severity: 'critical',
              category: 'language',
              description: warn,
              evidenceFromConversation: `Language mode configured as ${a.policy.mode} (${a.policy.script} script).`,
              whereInPrompt: 'Spoken dialogue lines',
              suggestedFix: `Rewrite any romanized Hindi words into Devanagari script (देवनागरी) while keeping English domain terms in Latin.`
            });
          }
        }
      }
    } else if (a.policy.mode === 'hinglish' && a.policy.script === 'latin') {
      // Check if dialogue is pure English with zero Hindi/Hinglish words
      const hasHindiWords = ROMANIZED_HINDI_CHECK.test(a.finalPrompt) || hasDevanagari;
      if (!hasHindiWords) {
        issues.push({
          severity: 'critical',
          category: 'language',
          description: 'User requested Hinglish mode, but agent dialogue is written in pure English.',
          evidenceFromConversation: 'User configured language mode as hinglish.',
          whereInPrompt: 'Say: dialogue lines across all call flow states',
          suggestedFix: 'Rewrite all agent dialogue (Say: lines) into conversational Hinglish (Roman/Latin script).'
        });
      }
    }
  }

  // (b) AI-disclosure check
  if (a.policy.aiDisclosure === 'deny' || a.spec?.meta?.aiDisclosure === 'deny') {
    if (/\b(ai assistant|virtual assistant|artificial intelligence|i am an ai|as an ai)\b/i.test(a.finalPrompt)) {
      issues.push({
        severity: 'critical',
        category: 'persona',
        description: 'User requested that AI disclosure be denied or hidden, but prompt refers to the agent as an AI assistant.',
        evidenceFromConversation: 'AI disclosure policy set to deny.',
        whereInPrompt: 'Agent identity and guardrails',
        suggestedFix: 'Remove statements disclosing AI identity and instruct agent: if asked if you are an AI, respond naturally as a member of the team and do not state you are an AI.'
      });
    }
  } else if (a.policy.aiDisclosure === 'disclose' || a.spec?.meta?.aiDisclosure === 'disclose') {
    if (/\b(do not reveal you are an ai|deny you are an ai|never admit to being an ai)\b/i.test(a.finalPrompt)) {
      issues.push({
        severity: 'critical',
        category: 'persona',
        description: 'User requested AI disclosure, but prompt instructs agent to deny being an AI.',
        evidenceFromConversation: 'AI disclosure policy set to disclose.',
        whereInPrompt: 'Agent identity and guardrails',
        suggestedFix: 'Update instructions to clearly disclose AI identity when asked by the caller.'
      });
    }
  }

  // (c) Agent gender agreement check
  if (a.policy.script === 'devanagari' || containsDevanagari(a.finalPrompt)) {
    if (a.policy.agentGender === 'male' && /(रही|सकती|करती|लेती|गई)\s*हूँ/.test(a.finalPrompt)) {
      issues.push({
        severity: 'major',
        category: 'persona',
        description: 'Agent gender is configured as male, but feminine Hindi verb inflections (e.g. कर रही हूँ / कर सकती हूँ) are used.',
        evidenceFromConversation: 'User configured agent gender as male.',
        whereInPrompt: 'Agent self-reference dialogue lines',
        suggestedFix: 'Change all feminine agent verb inflections to masculine forms (e.g. कर रहा हूँ / कर सकता हूँ).'
      });
    } else if (a.policy.agentGender === 'female' && /(रहा|सकता|करता|लेता|गया)\s*हूँ/.test(a.finalPrompt)) {
      issues.push({
        severity: 'major',
        category: 'persona',
        description: 'Agent gender is configured as female, but masculine Hindi verb inflections (e.g. कर रहा हूँ / कर सकता हूँ) are used.',
        evidenceFromConversation: 'User configured agent gender as female.',
        whereInPrompt: 'Agent self-reference dialogue lines',
        suggestedFix: 'Change all masculine agent verb inflections to feminine forms (e.g. कर रही हूँ / कर सकती हूँ).'
      });
    }
  }

  // (d) Primary goal presence check
  const coherence = validateCoherence(a.finalPrompt, {}, a.spec);
  if (!coherence.isValid && coherence.errors && coherence.errors.length > 0) {
    issues.push({
      severity: 'critical',
      category: 'coverage',
      description: coherence.errors[0] || 'Primary goal keywords not reflected in generated prompt.',
      evidenceFromConversation: `Primary goal: ${a.spec?.meta?.primaryGoal || 'Assist callers'}`,
      whereInPrompt: 'Call Flow / Objectives',
      suggestedFix: `Ensure the primary goal (${a.spec?.meta?.primaryGoal || ''}) is explicitly included in the agent objectives and call flow states.`
    });
  }

  // (e) Explicit user transcript prohibitions check (e.g., "never quote fees")
  if (a.transcript && a.transcript.length > 0) {
    const userText = a.transcript
      .filter(m => m.role.toLowerCase() === 'user')
      .map(m => m.content)
      .join(' ');

    if (/\b(never quote fees|don'?t quote fees|never mention prices|don'?t mention prices|no prices|no fees|do not quote prices)\b/i.test(userText)) {
      if (/\b(fee|price|cost|dollars?|\$\d+|INR|rupees?|\bRs\.?\s*\d+)\b/i.test(a.finalPrompt)) {
        issues.push({
          severity: 'major',
          category: 'incorrect',
          description: 'User explicitly requested to never quote fees, but prompt dialogue or instructions mention fees/pricing.',
          evidenceFromConversation: 'User stated: never quote fees / prices.',
          whereInPrompt: 'Dialogue or state instructions',
          suggestedFix: 'Remove any mention or quotation of fees or pricing from the dialogue and explicitly instruct agent never to quote fees.'
        });
      }
    }
  }

  // 2. LLM Rubric Audit (If transcript exists and LLM is available)
  if (a.transcript && a.transcript.length > 0) {
    const llm = getLlmClient();
    if (llm.generateRaw) {
      try {
        const chatHistory = a.transcript.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
        const judgePromptText = `You are a strict, highly accurate quality control judge evaluating a generated Voice AI system prompt against the user's interview transcript.

Compare the conversation history below with the generated voice-agent prompt.
Identify:
1. Every requirement the user expressed that the prompt fails to honor (missing, wrong, or contradicted).
2. Anything present in the prompt that the user never asked for or that is contradicted/ungrounded by the stated business context.
3. Any language/script mismatches (e.g., if user asked for Hinglish or Hindi but dialogue is pure English or romanized instead of Devanagari).

For each issue, assign:
- severity: 'critical' (wrong language/script like Hinglish->English or pure Latin instead of target script, primary goal absent, safety/guardrail section dropped, AI disclosure inverted), 'major' (prohibition ignored like quoting fees when told not to, required FAQ/fact missing, ungrounded/invented address or policy), or 'minor' (phrasing, ordering, or tone nits).
- category: 'language', 'missing', 'extra', 'incorrect', 'coverage', or 'persona'.
- description: concise, specific explanation of what is wrong or missing.
- evidenceFromConversation: the exact user intent or requirement from the conversation.
- whereInPrompt: section name or state where the issue occurs (or 'absent').
- suggestedFix: concrete instruction on how to fix it without altering unrelated parts.

Return JSON ONLY in this exact format:
{
  "verdict": "pass" | "fail",
  "score": 85,
  "issues": [
    {
      "severity": "critical",
      "category": "language",
      "description": "...",
      "evidenceFromConversation": "...",
      "whereInPrompt": "...",
      "suggestedFix": "..."
    }
  ]
}

CONVERSATION HISTORY:
${chatHistory}

GENERATED PROMPT:
${a.finalPrompt}`;

        const rawResp = await llm.generateRaw(judgePromptText, 0.1);
        if (rawResp) {
          const parsed = safeParseJson<JudgeReport>(rawResp, { verdict: 'pass', score: 100, issues: [], blockingCount: 0 });
          if (parsed && Array.isArray(parsed.issues)) {
            for (const llmIssue of parsed.issues) {
              if (!llmIssue || !llmIssue.description) continue;
              // Deduplicate against already captured deterministic issues
              const alreadyExists = issues.some(
                i => i.category === llmIssue.category &&
                     (i.description.toLowerCase().includes(llmIssue.description.toLowerCase()) ||
                      llmIssue.description.toLowerCase().includes(i.description.toLowerCase()))
              );
              if (!alreadyExists) {
                issues.push({
                  severity: llmIssue.severity || 'major',
                  category: llmIssue.category || 'incorrect',
                  description: llmIssue.description,
                  evidenceFromConversation: llmIssue.evidenceFromConversation || 'User conversation',
                  whereInPrompt: llmIssue.whereInPrompt || 'General prompt',
                  suggestedFix: llmIssue.suggestedFix || 'Update prompt to reflect requirement.'
                });
              }
            }
          }
        }
      } catch (err) {
        logger.warn("PromptJudge: LLM judge pass encountered error, using deterministic backstop issues", err);
      }
    }
  }

  const blockingCount = issues.filter(i => i.severity === 'critical').length;
  const majorCount = issues.filter(i => i.severity === 'major').length;
  const minorCount = issues.filter(i => i.severity === 'minor').length;

  const score = Math.max(0, Math.min(100, Math.round(100 - (blockingCount * 25 + majorCount * 10 + minorCount * 3))));
  const verdict = blockingCount === 0 ? 'pass' : 'fail';

  return {
    verdict,
    score,
    issues,
    blockingCount
  };
}

export async function repairFromJudge(a: {
  finalPrompt: string;
  report: JudgeReport;
  policy: LanguagePolicy;
  agentGender?: string;
}): Promise<string> {
  const issuesToRepair = (a.report?.issues || []).filter(i => i.severity === 'critical' || i.severity === 'major');
  if (issuesToRepair.length === 0) {
    return a.finalPrompt;
  }

  const llm = getLlmClient();
  if (!llm.generateRaw) {
    return a.finalPrompt;
  }

  const issueListFormatted = issuesToRepair.map((i, idx) => `Issue ${idx + 1} [${i.severity.toUpperCase()} - ${i.category}]:
Description: ${i.description}
Where: ${i.whereInPrompt}
Required Fix: ${i.suggestedFix}`).join('\n\n');

  const repairPromptText = `You are an expert Voice AI prompt repair specialist.
Below is a generated system prompt for a voice assistant (${a.policy.mode} mode, script: ${a.policy.script}, agentGender: ${a.agentGender || a.policy.agentGender || 'female'}).

Your task is to fix ONLY the following critical and major issues while preserving all correct sections, headers, and placeholders:
${issueListFormatted}

Strict Instructions:
1. Fix every listed issue completely and precisely.
2. If there is a language or script issue (e.g. Hinglish or Hindi requested but pure English found, or romanized Hindi instead of Devanagari): TRANSLATE all spoken dialogue (Say: lines, agent responses, opening lines) into the target language/script (${a.policy.mode} in ${a.policy.script} script). Do NOT just transliterate English; translate the conversational meaning into natural spoken ${a.policy.mode}. Keep English domain terms (demo, software, email, WhatsApp, coach, dashboard, etc.) in Latin/English script.
3. If there is an agent gender verb inflection issue, ensure all agent self-referencing verbs agree with ${a.agentGender || a.policy.agentGender || 'female'} (${(a.agentGender === 'male' || a.policy.agentGender === 'male') ? 'masculine, e.g. कर रहा हूँ / कर सकता हूँ' : 'feminine, e.g. कर रही हूँ / कर सकती हूँ'}).
4. Do NOT drop, rename, or reorder section headers (lines starting with ###).
5. Do NOT remove any placeholders ({{...}} or [...]).
6. Do NOT change sections or content that are unrelated to the reported issues.

Return ONLY the full corrected prompt text, starting directly with the first section header. Do not include markdown fences, preambles, or explanations.

CURRENT PROMPT:
${a.finalPrompt}`;

  try {
    const rawOut = await llm.generateRaw(repairPromptText, 0.1);
    if (!rawOut) return a.finalPrompt;

    let cleaned = rawOut.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const fenceMatch = cleaned.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      cleaned = fenceMatch[1].trim();
    } else {
      if (cleaned.startsWith('```markdown')) cleaned = cleaned.slice(11);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
    return cleaned || a.finalPrompt;
  } catch (err) {
    logger.warn("PromptJudge: repairFromJudge encountered error", err);
    return a.finalPrompt;
  }
}
