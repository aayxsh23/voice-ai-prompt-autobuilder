import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogicArchitect } from './architect';
import { llmClient } from '@/lib/llm/qwenProvider';

vi.mock('@/lib/llm/qwenProvider', () => ({
  llmClient: {
    generate: vi.fn(),
  },
}));

describe('LogicArchitect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates FSM states and accepts merged tools', async () => {
    // Mock the LLM returning a valid JSON string
    vi.mocked(llmClient.generate).mockResolvedValueOnce({
      text: JSON.stringify([
        {
          id: 'state_1',
          objective: 'Test objective',
          slotsToCollect: [],
        },
      ]),
    } as any);

    const result = await LogicArchitect.planWorkflow({
      meta: { companyName: 'TestCo' },
      tools: [{ name: 'custom_tool', description: 'A custom tool', parameters: { type: 'object', properties: {} } }]
    } as any);

    expect(result.fsmStates).toHaveLength(1);
    expect(result.fsmStates[0].id).toBe('state_1');
    expect(result.fsmStates[0].objective).toBe('Test objective');

    // The prompt should contain 'custom_tool' (merged tool registry)
    const promptArg = vi.mocked(llmClient.generate).mock.calls[0][0].prompt;
    expect(promptArg).toContain('custom_tool');
    expect(promptArg).toContain('validate_digit_input'); // system tool
  });

  it('falls back to default template on error', async () => {
    vi.mocked(llmClient.generate).mockRejectedValueOnce(new Error('LLM Error'));

    const result = await LogicArchitect.planWorkflow({
      meta: { callDirection: 'outbound' }
    } as any);

    expect(result.fsmStates).toBeInstanceOf(Array);
    expect(result.fsmStates.length).toBeGreaterThan(1);
    expect(result.fsmStates[0].id).toBe('identity_gate');
  });
});
