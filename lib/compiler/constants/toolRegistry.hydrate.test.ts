import { describe, it, expect } from 'vitest';
import {
  hydrateToolArgs,
  buildHydratedInvocation,
  SYSTEM_RUNTIME_TOOLS,
  getEmailTool,
} from './toolRegistry';

const tools = [...SYSTEM_RUNTIME_TOOLS, getEmailTool([])];

describe('hydrateToolArgs — set_capture_mode', () => {
  it('populates keep_buffer=true on entry, mode="digits" for a phone slot, field from slot, region-correct digits', () => {
    const args = hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'whatsapp', region: 'QA', onEntry: true });
    expect(args).toEqual({ keep_buffer: true, mode: 'digits', field: 'whatsapp', expected_digits: 8 });
  });

  it('flips keep_buffer=false on exit', () => {
    const args = hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'whatsapp', region: 'QA', onEntry: false });
    expect(args.keep_buffer).toBe(false);
  });

  it('uses region-specific phone digit lengths', () => {
    expect(hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'phone_number', region: 'IN', onEntry: true }).expected_digits).toBe(10);
    expect(hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'phone_number', region: 'AE', onEntry: true }).expected_digits).toBe(9);
    expect(hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'phone_number', region: 'QA', onEntry: true }).expected_digits).toBe(8);
  });

  it('omits expected_digits when the region is unknown (fail-safe, no guess)', () => {
    const args = hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'phone_number', onEntry: true });
    expect('expected_digits' in args).toBe(false);
  });

  it('picks mode="email" for email slots', () => {
    const args = hydrateToolArgs('set_capture_mode', undefined, { stateSlot: 'contact_email', region: 'IN', onEntry: true });
    expect(args.mode).toBe('email');
    expect('expected_digits' in args).toBe(false);
  });

  it('lets LLM-supplied args win over inferred defaults', () => {
    const args = hydrateToolArgs('set_capture_mode', { expected_digits: 12, field: 'account' }, { stateSlot: 'whatsapp', region: 'IN', onEntry: true });
    expect(args.expected_digits).toBe(12);
    expect(args.field).toBe('account');
  });
});

describe('hydrateToolArgs — validate_digit_input', () => {
  it('fills field, expected_digits, and both runtime placeholders', () => {
    const args = hydrateToolArgs('validate_digit_input', undefined, { stateSlot: 'pin_code', region: 'IN' });
    expect(args.field).toBe('pin_code');
    expect(args.expected_digits).toBe(6);
    expect(args.user_text).toEqual({ raw: '<latest_user_utterance>' });
    expect(args.previously_collected).toEqual({ raw: '<digits_so_far>' });
  });
});

// The final check that motivated this fix: the assembler's rendered call for a
// phone-collection state should be a fully-populated invocation, not `set_capture_mode()`.
describe('buildHydratedInvocation — end-to-end', () => {
  it('renders a fully-populated set_capture_mode for a QA phone state', () => {
    const out = buildHydratedInvocation('set_capture_mode', undefined, { stateSlot: 'whatsapp', region: 'QA', onEntry: true }, tools as any);
    expect(out).toBe('set_capture_mode(keep_buffer: true, mode: "digits", field: "whatsapp", expected_digits: 8)');
  });

  it('renders a fully-populated validate_digit_input for an IN pin state', () => {
    const out = buildHydratedInvocation('validate_digit_input', undefined, { stateSlot: 'pin_code', region: 'IN' }, tools as any);
    expect(out).toBe('validate_digit_input(field: "pin_code", expected_digits: 6, user_text: <latest_user_utterance>, previously_collected: <digits_so_far>)');
  });

  it('returns null for an unregistered tool (so callers emit nothing)', () => {
    const out = buildHydratedInvocation('transfer_call', {}, { stateSlot: 'x' }, tools as any);
    expect(out).toBeNull();
  });
});
