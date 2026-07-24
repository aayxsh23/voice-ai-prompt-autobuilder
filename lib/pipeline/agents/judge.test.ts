import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TheJudge } from './judge';
import { llmClient } from '@/lib/llm/qwenProvider';

vi.mock('@/lib/llm/qwenProvider', () => ({
  llmClient: {
    generate: vi.fn(),
  },
}));

describe('TheJudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('evaluates prompt and returns structured JSON verdict', async () => {
    vi.mocked(llmClient.generate).mockResolvedValueOnce({
      text: JSON.stringify({
        passed: false,
        score: 40,
        issues: [
          {
            type: 'duplicate_rule',
            culprit: 'optimizer',
            detail: 'Rule duplicated',
            suggestedFix: 'Remove it'
          }
        ]
      }),
    } as any);

    const result = await TheJudge.evaluate({} as any, { finalPrompt: 'some prompt' });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(40);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('duplicate_rule');
    expect(result.issues[0].culprit).toBe('optimizer');

    // Assert temperature is 0
    const callArgs = vi.mocked(llmClient.generate).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });
});
