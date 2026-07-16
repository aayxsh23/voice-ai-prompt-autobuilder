import { describe, it, expect } from 'vitest';
import { CoverageArchitect } from './CoverageArchitect';

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

  it('still reports operating hours as missing when never mentioned', () => {
    const report = CoverageArchitect.evaluate({}, [
      { role: 'user', content: 'I want an agent.' },
    ]);
    expect(report.missingFields).toContain('Operating Hours');
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
