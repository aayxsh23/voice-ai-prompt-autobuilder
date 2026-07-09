// lib/llm/llmClient.ts
import { QwenProvider } from './qwenProvider';
import { LlmService } from './types';

let cachedClient: LlmService | null = null;

export function getLlmClient(): LlmService {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.QWEN_API_KEY || "EMPTY";
  const baseUrl = process.env.QWEN_BASE_URL_FOR_LLM || process.env.QWEN_BASE_URL || "http://localhost:8000/v1";

  cachedClient = new QwenProvider(apiKey, undefined, baseUrl);
  return cachedClient;
}
