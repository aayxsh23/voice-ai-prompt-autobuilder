import { describe, it, expect, vi, afterEach } from 'vitest';
import { CoverageArchitect } from './CoverageArchitect';
import * as llmProvider from '@/lib/llm/llmProvider';

describe('CoverageArchitect language-aware detection', () => {
  it('recognizes operating hours answered in Hindi/Devanagari', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'हम सोमवार से शुक्रवार सुबह नौ बजे से शाम छह बजे तक खुले रहते हैं।' },
    ]);
    expect(report.missingFields).not.toContain('Operating Hours');
  });

  it('recognizes location/contact answered in Hindi', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'हमारा ऑफिस बेंगलुरु में है और वेबसाइट पर सारी जानकारी है।' },
    ]);
    expect(
      report.missingFields.some((f) => f.includes('Physical Location')),
    ).toBe(false);
  });

  it('still reports location as missing when never mentioned', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'I want an agent.' },
    ]);
    expect(report.missingFields).toContain('Physical Location & Contact Info (address, phone number, or website)');
  });
});

describe('CoverageArchitect behavior (characterization)', () => {
  it('an empty spec is not ready and reports many missing fields', () => {
    const report = CoverageArchitect.evaluate({}, []);
    expect(report.isReadyForCompilation).toBe(false);
    expect(report.missingFields.length).toBeGreaterThan(5);
  });

  it('detects services mentioned in English', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'We offer cleanings, x-rays and fillings.' },
    ]);
    expect(report.missingFields).not.toContain('Services Offered');
  });

  it('adds the interview-in-progress marker early in the conversation', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'I want an agent.' },
    ]);
    expect(
      report.missingFields.some((f) => f.includes('interview in progress')),
    ).toBe(true);
  });

  it('marks infields as covered when user specifies only Company Name or any variable bound', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'only Company Name' },
    ]);
    expect(
      report.missingFields.some((f) => f.includes('Infields & Pre-Call CRM Context Variables')),
    ).toBe(false);
  });

  it('marks infields as covered when dynamicVariables is populated in spec', () => {
    const report = CoverageArchitect.evaluate({
      dynamicVariables: [{ key: 'custom_var', label: 'Custom Var', type: 'business', fieldDirection: 'infield', required: true, defaultValue: '', source: 'crm', description: 'test' }]
    }, []);
    expect(
      report.missingFields.some((f) => f.includes('Infields & Pre-Call CRM Context Variables')),
    ).toBe(false);
  });
});

afterEach(() => vi.restoreAllMocks());

const mockLlm = (payload: unknown) =>
  vi.spyOn(llmProvider.llmClient, 'generate').mockResolvedValue({ text: JSON.stringify(payload) });

// 1c — the interview adapts to the use case instead of asking a fixed checklist,
// but never at the cost of the safety/identity floor.
describe('adaptive topics (notApplicableTopics)', () => {
  // Deliberately says nothing about keypads, so the DTMF rule is genuinely unanswered
  // and any change in whether it is asked comes from the relevance filter alone.
  const hist = [{ role: 'user', content: 'We are an outbound agent for a small studio.' }];

  it('skips a topic marked not applicable', () => {
    const withNa = CoverageArchitect.evaluate(
      { meta: { notApplicableTopics: ['interruption'] } } as never, hist);
    expect(withNa.missingFields.some(f => f.startsWith('Interruption'))).toBe(false);
  });

  it('still asks that topic when nothing is marked not applicable', () => {
    const base = CoverageArchitect.evaluate({}, hist);
    expect(base.missingFields.some(f => f.startsWith('Interruption'))).toBe(true);
  });

  it('refuses to skip the mandatory floor even if asked to', () => {
    const report = CoverageArchitect.evaluate(
      { meta: { notApplicableTopics: ['language', 'disclosures', 'injection', 'primary_goal'] } } as never, hist);
    expect(report.missingFields.some(f => f.startsWith('Primary Agent Language'))).toBe(true);
    expect(report.missingFields.some(f => f.startsWith('Consent & Compliance Disclosures'))).toBe(true);
  });

  it('drops floor ids from the LLM selection rather than trusting the model', async () => {
    mockLlm({ notApplicable: ['interruption', 'language', 'injection'] });
    const na = await CoverageArchitect.selectNotApplicableTopics({}, hist);
    expect(na).toContain('interruption');
    expect(na).not.toContain('language');
    expect(na).not.toContain('injection');
  });

  it('treats everything as applicable when the LLM fails', async () => {
    vi.spyOn(llmProvider.llmClient, 'generate').mockRejectedValue(new Error('down'));
    expect(await CoverageArchitect.selectNotApplicableTopics({}, hist)).toEqual([]);
  });
});

// 1b — the rules decide WHAT to ask; they are a poor judge of whether a keyword
// match actually answered it. The adjudicator catches that at the boundary.
describe('coverage adjudication', () => {
  const hist = [{ role: 'user', content: 'Our staff speak English to each other.' }];

  it('reopens a topic the rules believed was answered', async () => {
    mockLlm({ unanswered: ['language'] });
    const reopened = await CoverageArchitect.adjudicateCoverage({}, hist, []);
    expect(reopened.some(l => l.startsWith('Primary Agent Language'))).toBe(true);
  });

  it('returns nothing when the audit finds no gaps', async () => {
    mockLlm({ unanswered: [] });
    expect(await CoverageArchitect.adjudicateCoverage({}, hist, [])).toEqual([]);
  });

  it('ignores unknown ids from the model', async () => {
    mockLlm({ unanswered: ['not_a_real_rule'] });
    expect(await CoverageArchitect.adjudicateCoverage({}, hist, [])).toEqual([]);
  });

  it('fails open so a judge outage cannot block the interview', async () => {
    vi.spyOn(llmProvider.llmClient, 'generate').mockRejectedValue(new Error('down'));
    expect(await CoverageArchitect.adjudicateCoverage({}, hist, [])).toEqual([]);
  });
});
