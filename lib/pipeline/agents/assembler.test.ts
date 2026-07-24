import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MasterAssembler } from './assembler';
import { llmClient } from '@/lib/llm/qwenProvider';

vi.mock('@/lib/llm/qwenProvider', () => ({
  llmClient: {
    generate: vi.fn(),
  },
}));

describe('MasterAssembler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a single RULES section and avoids duplication', async () => {
    const mockOutput = `### RULES\n- If audio drops, wait 5s.\n\n### FSM STATES\n- Pitch state: If pushback, drop it.`;
    
    vi.mocked(llmClient.generate).mockResolvedValueOnce({
      text: mockOutput,
    } as any);

    const result = await MasterAssembler.assemble({
      businessSpec: {} as any,
      fsmStates: [{ id: 'pitch_state', objective: 'Pitch product', notes: ['If pushback, drop it.'], edges: [] }],
      globalGuardrails: ['If audio drops, wait 5s.'],
      tools: []
    });

    expect(result.finalPrompt).toBe(mockOutput);
    
    // Assert temperature is 0
    const callArgs = vi.mocked(llmClient.generate).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
    expect(callArgs.prompt).toContain('EXACTLY ONE "### RULES" section');
  });
});
