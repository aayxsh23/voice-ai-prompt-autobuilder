import fs from 'fs';
import path from 'path';

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface TokenLogEntry {
  timestamp: string;
  contextLabel: string;
  usage: TokenUsage;
}

export function logTokenUsage(sessionId: string, contextLabel: string, usage: TokenUsage) {
  try {
    const logsDir = path.join(process.cwd(), 'logs', sessionId);
    
    // Ensure the directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, 'tokens.jsonl');
    
    const entry: TokenLogEntry = {
      timestamp: new Date().toISOString(),
      contextLabel,
      usage,
    };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (error) {
    console.error(`Failed to write token log for session ${sessionId}:`, error);
  }
}
