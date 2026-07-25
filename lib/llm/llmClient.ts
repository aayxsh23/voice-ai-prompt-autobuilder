// lib/llm/llmClient.ts
import { llmProvider } from './llmProvider';
import { LlmService } from './types';

let cachedClient: LlmService | null = null;

export function getLlmClient(): LlmService {
  if (cachedClient) return cachedClient;
  cachedClient = new llmProvider();
  return cachedClient;
}
