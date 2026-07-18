import { JudgeReport, JudgeIssue } from "./types";
import { ChatMessage, BusinessSpecification, safeParseJson } from "@/lib/llm/types";
import { LanguagePolicy } from "@/lib/llm/language/LanguagePolicy";
import { checkContracts, type ContractViolation } from "@/lib/pipeline/contracts/promptContracts";
import { getLlmClient } from "@/lib/llm/llmClient";
import { PROMPT_EDITOR_INSTRUCTION } from "@/lib/llm/qwenProvider";
import { logger } from "@/lib/logger";

/** Contract violations and judge issues carry the same information. */
function toJudgeIssue(v: ContractViolation): JudgeIssue {
  return {
    severity: v.severity,
    category: v.category,
    description: v.description,
    evidenceFromConversation: v.evidence || 'Configured requirement',
    whereInPrompt: v.whereInPrompt || 'General prompt',
    suggestedFix: v.suggestedFix,
  };
}

const JUDGE_SYSTEM_INSTRUCTION = `You are a strict, highly accurate quality-control judge for voice-agent system prompts.
You compare an interview transcript against a generated prompt and report every discrepancy you find.
Return ONLY a valid JSON object matching the requested schema — no markdown, no code fences, no prose outside the JSON.`;

export async function judgePrompt(a: {
  transcript: ChatMessage[];
  finalPrompt: string;
  spec: BusinessSpecification;
  policy: LanguagePolicy;
}): Promise<JudgeReport> {
  // 1. Deterministic backstops — delegated wholesale to the shared contract module.
  //
  // These used to be a second, hand-rolled copy of the same rules living only in the
  // judge. That split meant a contract added for CI never protected production (and
  // vice versa). Now promptContracts.ts is the single source of truth and both the
  // contract harness and this judge run the identical checks.
  //
  // The old primary-goal check is intentionally gone: it asked whether any goal
  // keyword appeared anywhere in the prompt, but the assembler always renders
  // "- Primary Goal: <goal>" verbatim, so it could never fail on a real prompt.
  // stage_coverage replaces it with a check that can actually detect a goal the flow
  // never implements.
  const issues: JudgeIssue[] = checkContracts({
    prompt: a.finalPrompt,
    spec: a.spec,
    transcript: a.transcript,
    policy: a.policy,
  }).map(toJudgeIssue);


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
3. Any language/script mismatches (e.g., if user asked for Hinglish or Hindi but dialogue is pure English or romanized instead of Devanagari, OR if English words originating from English like WhatsApp, registered, training, billing, software, demo, email, phone are transliterated to Devanagari instead of remaining in Roman/English script).
4. Any country/region mismatches in emergency numbers or currency (e.g., if the deployment region is India 'IN' or Qatar 'QA', but the prompt cites US 911/988 or USD $, flag as a critical error and instruct the repair loop to modify the emergency numbers and currency based on the country).

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

        // Must request JSON explicitly: the provider's legacy phrase-sniffing does not
        // match this prompt, so the judge would otherwise run with the prose-authoring
        // system prompt ("No JSON wrapping…") and no response_format — its output would
        // never parse and every audit would silently fall back to "pass".
        const rawResp = await llm.generateRaw(judgePromptText, 0.1, {
          json: true,
          systemInstruction: JUDGE_SYSTEM_INSTRUCTION,
          contextLabel: "PromptJudge LLM Audit",
        });
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

  let currentPrompt = a.finalPrompt;
  const feeIssue = issuesToRepair.find(i => /prohibition.*(?:fee|price|cost|quote)|never quote fees/i.test(i.description));
  if (feeIssue) {
    currentPrompt = currentPrompt.replace(/Say:\s*"[^"]*\b(?:fee|price|cost|\$\d+|INR|rupees?|\bRs\.?\s*\d+)[^"]*"/gi, `Say: "Our sales team handles all pricing and fee inquiries, so they will be happy to discuss that with you."`);
    if (!/### SCOPE & REFUSAL BEHAVIOR[\s\S]*?never quote fees/i.test(currentPrompt)) {
      currentPrompt = currentPrompt.replace(/### SCOPE & REFUSAL BEHAVIOR/, `### SCOPE & REFUSAL BEHAVIOR\n- Never quote fees, prices, or rates under any circumstances. If asked about pricing, defer to sales or follow-up.`);
    }
  }

  const llm = getLlmClient();
  if (!llm.generateRaw) {
    return currentPrompt;
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
2. If there is a language or script issue (e.g. Hinglish or Hindi requested but pure English found, or romanized Hindi instead of Devanagari): TRANSLATE all spoken dialogue (Say: lines, agent responses, opening lines) into the target language/script (${a.policy.mode} in ${a.policy.script} script). Do NOT just transliterate English; translate the conversational meaning into natural spoken ${a.policy.mode}. ENGLISH WORDS RULE: Any word originating from English (such as WhatsApp, registered, training, billing, software, demo, email, phone, callback, status, schedule, slot, reach, team, number, etc.) MUST remain in Latin/English script within the Devanagari sentence. NEVER transliterate English words into Devanagari. Example: "क्या आपका registered नंबर WhatsApp पर reach करने योग्य है?" NOT "क्या आपका रजिस्टर्ड नंबर व्हाट्सएप पर रीच करने योग्य है?"
3. If there is an agent gender verb inflection issue, ensure all agent self-referencing verbs agree with ${a.agentGender || a.policy.agentGender || 'female'} (${(a.agentGender === 'male' || a.policy.agentGender === 'male') ? 'masculine, e.g. कर रहा हूँ / कर सकता हूँ' : 'feminine, e.g. कर रही हूँ / कर सकती हूँ'}).
4. Do NOT drop, rename, or reorder section headers (lines starting with ###).
5. Do NOT remove any placeholders ({{...}} or [...]).
6. Do NOT change sections or content that are unrelated to the reported issues.

Return ONLY the full corrected prompt text, starting directly with the first section header. Do not include markdown fences, preambles, or explanations.

CURRENT PROMPT:
${currentPrompt}`;

  try {
    // Edit pass, not an authoring pass — the default system prompt would tell the model
    // to re-author a prompt with a mandated section list, working against "change only
    // what is listed".
    const rawOut = await llm.generateRaw(repairPromptText, 0.1, {
      json: false,
      systemInstruction: PROMPT_EDITOR_INSTRUCTION,
      contextLabel: "PromptJudge Repair",
    });
    if (!rawOut) return currentPrompt;

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
    return cleaned || currentPrompt;
  } catch (err) {
    logger.warn("PromptJudge: repairFromJudge encountered error", err);
    return currentPrompt;
  }
}
