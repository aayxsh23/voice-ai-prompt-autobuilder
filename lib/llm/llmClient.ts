import { GeminiProvider } from './geminiProvider';
import { MockLlmProvider } from './mockLlmProvider';
import { LlmService } from './types';

let cachedClient: LlmService | null = null;

export function getLlmClient(): LlmService {
  if (cachedClient) return cachedClient;

  const provider = process.env.LLM_PROVIDER?.toLowerCase() || 'mock';
  const apiKey = process.env.GEMINI_API_KEY;

  if (provider === 'gemini') {
    if (!apiKey || apiKey.trim() === '') {
      console.warn('⚠️ LLM_PROVIDER is set to "gemini" but GEMINI_API_KEY is missing. Seamlessly falling back to Mock Generation Mode.');
      cachedClient = new MockLlmProvider();
    } else {
      cachedClient = new GeminiProvider(apiKey);
    }
  } else {
    cachedClient = new MockLlmProvider();
  }

  return cachedClient;
}
