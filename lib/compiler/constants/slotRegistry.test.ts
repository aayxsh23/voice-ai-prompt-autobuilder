import { describe, it, expect } from 'vitest';
import { resolveSlotDigitSpec, isDerivedSlot } from './slotRegistry';

describe('resolveSlotDigitSpec', () => {
  it('classifies email slots as email mode', () => {
    expect(resolveSlotDigitSpec('user_email')).toEqual({ mode: 'email' });
  });

  it('returns null for non-numeric slots', () => {
    expect(resolveSlotDigitSpec('fitness_goal')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveSlotDigitSpec('')).toBeNull();
  });

  // Phone length is region-specific. Asserting a default (10) at a Qatar caller,
  // whose numbers are 8 digits, makes validate_digit_input reject every valid entry.
  describe('region-dependent digit counts', () => {
    it('omits expected_digits for a phone when the region is unknown', () => {
      expect(resolveSlotDigitSpec('mobile_number')).toEqual({ mode: 'digits' });
    });

    it('uses the region-correct phone length', () => {
      expect(resolveSlotDigitSpec('mobile_number', 'IN')).toEqual({ expectedDigits: 10, mode: 'digits' });
      expect(resolveSlotDigitSpec('contact_number', 'QA')).toEqual({ expectedDigits: 8, mode: 'digits' });
      expect(resolveSlotDigitSpec('whatsapp', 'AE')).toEqual({ expectedDigits: 9, mode: 'digits' });
    });

    it('omits expected_digits for an unlisted region rather than guessing', () => {
      expect(resolveSlotDigitSpec('mobile_number', 'ZZ')).toEqual({ mode: 'digits' });
    });

    it('applies the conventional OTP length only once a region is established', () => {
      expect(resolveSlotDigitSpec('otp')).toEqual({ mode: 'digits' });
      expect(resolveSlotDigitSpec('otp', 'IN')).toEqual({ expectedDigits: 6, mode: 'digits' });
    });

    it('keeps region-independent lengths regardless', () => {
      expect(resolveSlotDigitSpec('date_of_birth')).toEqual({ expectedDigits: 8, mode: 'digits' });
    });
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
