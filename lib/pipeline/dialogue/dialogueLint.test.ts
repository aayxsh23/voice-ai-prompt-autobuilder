import { describe, it, expect } from 'vitest';
import {
  isInstructionLike,
  lintDialogueLine,
  lintPrompt,
  extractSpokenLines,
  dialogueScore,
} from './dialogueLint';

// The instruction lines below are verbatim from a real generated VLCC Qatar prompt,
// where the agent would have read them aloud to the caller.
describe('isInstructionLike', () => {
  const instructions = [
    'Accept immediately, apologize, and close without re-pitching.',
    'Apologize and close.',
    'Issue one immediate polite shutdown statement and end the call. Do not attempt de-escalation or negotiate.',
    'Politely redirect once. If the user persists, politely end the call.',
    'After 3 failed attempts, politely wrap up the call and terminate.',
    'Read back the confirmed booking details, ask if anything else is needed, and deliver a polite goodbye.',
  ];
  it.each(instructions)('flags builder instruction: %s', (line) => {
    expect(isInstructionLike(line)).toBe(true);
  });

  // Real dialogue must never trip the detector, in any domain or language.
  const dialogue = [
    'Hello, I\'m Sara, an AI assistant calling on behalf of VLCC Qatar. Am I speaking with {{customer_name}}?',
    'Thank you for speaking with me today, goodbye!',
    'Could you please share your booking date?',
    'I understand you might be busy, is there a better time to reach you?',
    'Wonderful. Our team will review this and follow up shortly.',
    'Do not worry, I can help you with that.',
    'Let me transfer you to the front desk.',
    'नमस्ते, मैं VLCC से बात कर रही हूँ।',
  ];
  it.each(dialogue)('does not flag real dialogue: %s', (line) => {
    expect(isInstructionLike(line)).toBe(false);
  });

  it('tolerates a Say:-wrapped line', () => {
    expect(isInstructionLike('Say: "Apologize and close."')).toBe(true);
  });
});

describe('lintDialogueLine', () => {
  it('flags an internal field name spoken aloud', () => {
    const f = lintDialogueLine('Could you please share your booking_time_window?');
    expect(f.some(x => x.rule === 'internal_field_name')).toBe(true);
  });

  it('does not treat placeholders as internal field names', () => {
    const f = lintDialogueLine('Am I speaking with {{customer_name}}?');
    expect(f.some(x => x.rule === 'internal_field_name')).toBe(false);
  });

  it('flags two questions in one turn', () => {
    const f = lintDialogueLine('Is now a good time? Can I ask your name?');
    expect(f.some(x => x.rule === 'stacked_questions' && x.severity === 'major')).toBe(true);
  });

  it('flags AI-register vocabulary as minor only', () => {
    const f = lintDialogueLine('We offer a robust and vibrant experience.');
    const lex = f.find(x => x.rule === 'ai_lexicon');
    expect(lex?.severity).toBe('minor');
  });

  it('flags canned assistant filler', () => {
    const f = lintDialogueLine("Certainly! I'd be happy to assist you with that.");
    expect(f.some(x => x.rule === 'canned_assistant')).toBe(true);
  });

  it('flags TTS-hazardous punctuation', () => {
    const f = lintDialogueLine('Sure — let me check that for you.');
    expect(f.some(x => x.rule === 'tts_hazard')).toBe(true);
  });

  it('passes a clean, human line with no findings', () => {
    expect(lintDialogueLine('Which day suits you best?')).toEqual([]);
  });
});

describe('lintPrompt / extractSpokenLines', () => {
  const prompt = `### CALL FLOW
STATE: [closing] (Closing)
* **Dialogue Directive:** Say: "Read back the confirmed booking details, ask if anything else is needed, and deliver a polite goodbye."

STATE: [greet] (Greet)
* **Dialogue Directive:** Say: "Which day suits you best?"`;

  it('extracts only the spoken lines', () => {
    expect(extractSpokenLines(prompt)).toHaveLength(2);
  });

  it('surfaces the instruction-as-speech line as critical', () => {
    const findings = lintPrompt(prompt);
    expect(findings.some(f => f.rule === 'instruction_as_speech' && f.severity === 'critical')).toBe(true);
  });
});

describe('dialogueScore', () => {
  it('is 100 for a clean prompt and drops hardest on structural faults', () => {
    expect(dialogueScore([])).toBe(100);
    expect(dialogueScore(lintDialogueLine('Which day suits you best?'))).toBe(100);
    expect(dialogueScore(lintDialogueLine('Apologize and close.'))).toBeLessThan(80);
  });
});
