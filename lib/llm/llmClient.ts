// lib/llm/llmClient.ts
import { GeminiProvider } from './geminiProvider';
import { LlmService } from './types';

let cachedClient: LlmService | null = null;

export function getLlmClient(): LlmService {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error("FATAL: GEMINI_API_KEY is missing. The compiler cannot run.");
  }

  cachedClient = new GeminiProvider(apiKey);
  return cachedClient;
}
