// lib/llm/llmClient.ts
import { QwenProvider } from './qwenProvider';
import { LlmService } from './types';

let cachedClient: LlmService | null = null;

export function getLlmClient(): LlmService {
  if (cachedClient) return cachedClient;
  cachedClient = new QwenProvider();
  return cachedClient;
}
