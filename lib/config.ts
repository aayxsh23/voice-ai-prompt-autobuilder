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
    process.env.QWEN_BASE_URL_FOR_LLM ||
    process.env.QWEN_BASE_URL ||
    'http://localhost:8000/v1',
  apiKey: process.env.QWEN_API_KEY || 'EMPTY',
  model: process.env.QWEN_MODEL || 'Qwen/Qwen3.6-35B-A3B-FP8',
  timeoutMs: Number(process.env.QWEN_TIMEOUT_MS) || 60_000,
  maxRetries: Number.isFinite(Number(process.env.QWEN_MAX_RETRIES))
    ? Number(process.env.QWEN_MAX_RETRIES)
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

