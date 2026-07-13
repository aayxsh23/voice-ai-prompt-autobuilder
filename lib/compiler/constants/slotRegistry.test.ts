import { describe, it, expect } from 'vitest';
import { resolveSlotDigitSpec, isDerivedSlot } from './slotRegistry';

describe('resolveSlotDigitSpec', () => {
  it('classifies email slots as email mode', () => {
    expect(resolveSlotDigitSpec('user_email')).toEqual({ expectedDigits: 0, mode: 'email' });
  });

  it('classifies phone slots as 10 digits', () => {
    expect(resolveSlotDigitSpec('mobile_number')).toEqual({ expectedDigits: 10, mode: 'digits' });
  });

  it('classifies OTP/pin slots as 6 digits', () => {
    expect(resolveSlotDigitSpec('otp')).toEqual({ expectedDigits: 6, mode: 'digits' });
  });

  it('returns null for non-numeric slots', () => {
    expect(resolveSlotDigitSpec('fitness_goal')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveSlotDigitSpec('')).toBeNull();
  });
});

describe('isDerivedSlot', () => {
  it('flags classification/extraction outfields as derived (never asked)', () => {
    for (const s of [
      'objection_type', 'booking_status', 'transfer_status', 'intent_category',
      'customer_intent', 'intent_classification', 'eligibility_status',
      'detected_language', 'opt_out_confirmed', 'opt_out_requested', 'health_flag_status',
    ]) {
      expect(isDerivedSlot(s), s).toBe(true);
    }
  });

  it('does NOT flag genuinely collected slots', () => {
    for (const s of [
      'preferred_appointment_date', 'preferred_appointment_time', 'updated_phone_number',
      'service_location', 'caller_name', 'first_name', 'email', 'pincode',
    ]) {
      expect(isDerivedSlot(s), s).toBe(false);
    }
  });

  it('returns false for empty input', () => {
    expect(isDerivedSlot('')).toBe(false);
  });
});
