import { describe, it, expect } from 'vitest';
import { parseRequiredStages } from './route';
import { coerceText } from '../autofill/route';
import { getBlockingGaps, getModuleCompletion, initialData } from '@/components/project/BuilderForm';

describe('coerceText', () => {
  it('passes a plain string through', () => {
    expect(coerceText('  Never quote an exact price.  ')).toBe('Never quote an exact price.');
  });

  // The model answers "one rule per line" with an array more often than not.
  it('joins an array of strings into lines', () => {
    expect(coerceText(['Never promise a discount.', 'Always offer a transfer if asked twice.']))
      .toBe('Never promise a discount.\nAlways offer a transfer if asked twice.');
  });

  it('unwraps an array of single-field objects', () => {
    expect(coerceText([{ rule: 'Never diagnose over the phone.' }, { rule: 'Verify identity first.' }]))
      .toBe('Never diagnose over the phone.\nVerify identity first.');
  });

  it('drops blanks and non-text shapes instead of emitting empty lines', () => {
    expect(coerceText(['Keep this', '', '   ', 42, null])).toBe('Keep this');
    expect(coerceText(undefined)).toBe('');
    expect(coerceText({ unexpected: 'shape' })).toBe('');
  });
});

describe('parseRequiredStages', () => {
  it('turns a numbered plain-language sketch into one stage per line', () => {
    const stages = parseRequiredStages(
      '1. Greet and introduce yourself\n2. Ask what they need\n3. Confirm next steps and close',
    );
    expect(stages).toEqual([
      { id: 'greet_and_introduce_yourself', label: 'Greet and introduce yourself' },
      { id: 'ask_what_they_need', label: 'Ask what they need' },
      { id: 'confirm_next_steps_and_close', label: 'Confirm next steps and close' },
    ]);
  });

  it('accepts bullets, parenthesised numbers and blank lines', () => {
    const stages = parseRequiredStages('- Verify identity\n\n2) State the overdue amount\n• Offer a payment plan');
    expect(stages.map((s) => s.label)).toEqual([
      'Verify identity',
      'State the overdue amount',
      'Offer a payment plan',
    ]);
  });

  it('returns nothing for empty input rather than a bogus stage', () => {
    expect(parseRequiredStages('')).toEqual([]);
    expect(parseRequiredStages('   \n \n')).toEqual([]);
  });

  it('caps runaway input so the planner is not handed 50 mandatory stages', () => {
    const flow = Array.from({ length: 30 }, (_, i) => `${i + 1}. Step number ${i + 1}`).join('\n');
    expect(parseRequiredStages(flow)).toHaveLength(12);
  });
});

describe('builder form gating', () => {
  it('blocks submission until company, purpose and flow exist', () => {
    expect(getBlockingGaps(initialData)).toHaveLength(3);

    const filled = {
      ...initialData,
      companyName: 'Meridian Dental',
      callPurpose: 'Book appointments for new and returning callers',
      callFlow: '1. Greet\n2. Book\n3. Close',
    };
    expect(getBlockingGaps(filled)).toEqual([]);
  });

  it('blocks a knowledge base that is switched on but empty', () => {
    const d = {
      ...initialData,
      companyName: 'A',
      callPurpose: 'B',
      callFlow: 'C',
      kbEnabled: true,
      kbContent: '   ',
    };
    expect(getBlockingGaps(d)).toContain('Knowledge base content (Knowledge Base & Guardrails)');
  });

  it('blocks live transfer with no reachable number', () => {
    const d = {
      ...initialData,
      companyName: 'A',
      callPurpose: 'B',
      callFlow: 'C',
      liveTransferEnabled: true,
      transferNumbers: [{ label: 'Manager', number: '' }],
    };
    expect(getBlockingGaps(d)).toContain('At least one transfer number (Settings)');
  });
});

describe('module completion', () => {
  it('reports empty, partial and complete for the persona module', () => {
    expect(getModuleCompletion('persona', initialData)).toBe('empty');
    expect(getModuleCompletion('persona', { ...initialData, companyName: 'Acme' })).toBe('partial');
    expect(
      getModuleCompletion('persona', {
        ...initialData,
        companyName: 'Acme',
        agentName: 'Ava',
        industry: 'Healthcare',
        callPurpose: 'Book follow-ups',
      }),
    ).toBe('complete');
  });

  it('treats a disabled knowledge base as empty, not incomplete', () => {
    expect(getModuleCompletion('knowledge', initialData)).toBe('empty');
    expect(getModuleCompletion('knowledge', { ...initialData, kbEnabled: true })).toBe('partial');
    expect(getModuleCompletion('knowledge', { ...initialData, kbEnabled: true, kbContent: 'hours: 9-5' })).toBe('complete');
  });
});
