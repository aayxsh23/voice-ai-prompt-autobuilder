import { describe, it, expect } from 'vitest';
import { buildToolInvocation, isRegisteredTool, SYSTEM_RUNTIME_TOOLS, getEmailTool } from './toolRegistry';

const tools = [...SYSTEM_RUNTIME_TOOLS, getEmailTool(['Professional'])];

describe('isRegisteredTool', () => {
  it('accepts a registered tool and rejects an invented one', () => {
    expect(isRegisteredTool('end_call', tools)).toBe(true);
    expect(isRegisteredTool('transfer_call', tools)).toBe(false);
  });
});

describe('buildToolInvocation', () => {
  it('renders args in the schema-declared order, quoting strings only', () => {
    expect(
      buildToolInvocation('validate_digit_input', {
        // deliberately out of schema order
        previously_collected: { raw: 'all_digits_collected_so_far' },
        expected_digits: 10,
        field: 'whatsapp',
        user_text: { raw: 'caller_utterance' },
      }, tools)
    ).toBe('validate_digit_input(field: "whatsapp", expected_digits: 10, user_text: caller_utterance, previously_collected: all_digits_collected_so_far)');
  });

  it('renders booleans bare and omits args the caller did not supply', () => {
    expect(buildToolInvocation('set_capture_mode', { keep_buffer: false }, tools))
      .toBe('set_capture_mode(keep_buffer: false)');
  });

  it('drops arguments the schema does not declare', () => {
    expect(buildToolInvocation('end_call', { reason: 'completed', bogus: 'x' }, tools))
      .toBe('end_call(reason: "completed")');
  });

  it('returns null for an unregistered tool so callers emit nothing', () => {
    expect(buildToolInvocation('transfer_call', { reason: 'x' }, tools)).toBeNull();
  });
});
