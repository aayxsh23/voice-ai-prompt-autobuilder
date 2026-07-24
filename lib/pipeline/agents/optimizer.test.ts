import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyOptimizer } from './optimizer';
import { llmClient } from '@/lib/llm/qwenProvider';

vi.mock('@/lib/llm/qwenProvider', () => ({
  llmClient: {
    generate: vi.fn(),
  },
}));

describe('PolicyOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies topics and splits into global vs stage-contextual', async () => {
    const mockTopics = [
      { topic: 'Audio drop', content: 'If audio drops, wait 5s.' },
      { topic: 'Cross sell pushback', content: 'If pushback, drop it.' }
    ];

    vi.mocked(llmClient.generate).mockResolvedValueOnce({
      text: JSON.stringify([
        {
          topic: 'Audio drop',
          classification: 'unique-global',
          content: 'If audio drops, wait 5s.'
        },
        {
          topic: 'Cross sell pushback',
          classification: 'stage-contextual',
          targetStateId: 'pitch_state',
          content: 'If pushback, drop it.'
        }
      ]),
    } as any);

    const result = await PolicyOptimizer.optimize({
      businessSpec: { capturedTopics: mockTopics } as any,
      fsmStates: [{ id: 'pitch_state', objective: 'Pitch product', slotsToCollect: [] }]
    });

    expect(result.globalGuardrails).toHaveLength(1);
    expect(result.globalGuardrails[0]).toBe('If audio drops, wait 5s.');

    expect(result.mappedStateNotes['pitch_state']).toHaveLength(1);
    expect(result.mappedStateNotes['pitch_state'][0]).toBe('If pushback, drop it.');

    // Assert temperature is 0
    const callArgs = vi.mocked(llmClient.generate).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });
});
