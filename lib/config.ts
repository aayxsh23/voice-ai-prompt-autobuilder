import { z } from 'zod';

/**
 * Centralized, validated runtime configuration.
 *
 * The app runs entirely on Qwen via an OpenAI-compatible endpoint (vLLM / Ollama /
 * hosted). Values fall back to local-dev defaults so lint/build/test never hard-fail
 * on a missing variable; the schema still guarantees the shapes the code relies on.
 */
const llmConfigSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  /** Per-request timeout (ms) — LLM calls can hang; fail fast instead. */
  timeoutMs: z.number().int().positive(),
  /** Bounded retries with the SDK's exponential backoff for transient failures. */
  maxRetries: z.number().int().min(0),
});

export const llmConfig = llmConfigSchema.parse({
  baseUrl:
    process.env.GEMINI_BASE_URL_FOR_LLM ||
    process.env.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || 'EMPTY',
  model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 60_000,
  maxRetries: Number.isFinite(Number(process.env.GEMINI_MAX_RETRIES))
    ? Number(process.env.GEMINI_MAX_RETRIES)
    : 3,
});

export type LlmConfig = typeof llmConfig;

export const JUDGE_ENABLED = process.env.JUDGE_ENABLED !== 'false';
/**
 * Repair attempts before delivering the best-scoring prompt. Kept low deliberately:
 * the loop only runs on CRITICAL issues, and the accept-only-if-better guard means a
 * second round rarely helps — the cost is user-visible latency.
 */
export const JUDGE_MAX_ROUNDS = Number(process.env.JUDGE_MAX_ROUNDS) || 2;
/** Hard wall-clock stop so generation can never hang on the judge. */
export const JUDGE_TIME_BUDGET_MS = Number(process.env.JUDGE_TIME_BUDGET_MS) || 60_000;
export const JUDGE_HARD_GATE = process.env.JUDGE_HARD_GATE === 'true';

