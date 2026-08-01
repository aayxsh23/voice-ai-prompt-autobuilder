'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BuilderForm, initialData, COUNTRY_CODES } from '@/components/project/BuilderForm';
import { ArrowRight, Bot, CheckCircle, Edit3 } from 'lucide-react';
import { PromptPackageDraft } from '@/lib/llm/types';

function SummaryItem({ label, value }: { label: string, value: string | React.ReactNode }) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="mb-4 flex flex-col gap-1">
      <div className="text-[16px] font-bold text-ink">{label}</div>
      <div className="text-[16px] text-ink/90 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

export default function FormBuilderPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Evaluation / Clarification State
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<number, string>>({});
  
  // Review & Generate State
  const [reviewMode, setReviewMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<PromptPackageDraft | null>(null);

  useEffect(() => {
    params.then(p => {
      setSessionId(p.sessionId);
      setLoading(false);
    });
  }, [params]);

  const handleEvaluate = async () => {
    if (formData.phone) {
      const selectedCountry = COUNTRY_CODES.find(c => c.code === formData.phoneCode);
      const expectedDigits = selectedCountry?.digits || 10;
      if (formData.phone.length < expectedDigits) {
        setPhoneError(`Please provide the expected ${expectedDigits} digits for ${selectedCountry?.country}.`);
        return;
      }
    }
    setPhoneError('');

    setIsSubmitting(true);
    setClarificationQuestions([]);
    try {
      const res = await fetch('/api/builder/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: formData, sessionId })
      });
      const data = await res.json();
      if (data.questions && data.questions.length > 0) {
        setClarificationQuestions(data.questions);
      } else {
        setReviewMode(true);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to evaluate form.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitClarifications = () => {
    setReviewMode(true);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/builder/generate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: { businessName: formData.companyName },
          languageMode: formData.language,
          overrides: { faqPairs: [], objectionPairs: [], verbatimLines: [], transferRules: [] },
          form: formData,
          clarifications: clarificationAnswers,
          sessionId
        })
      });
      const data = await res.json();
      if (data) {
        setDraft(data);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate prompt.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveProject = async () => {
    try {
      const res = await fetch('/api/builder/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          draft,
          blueprint: { business: { businessName: formData.companyName }, languageMode: formData.language }
        })
      });
      const project = await res.json();
      if (project && project.id) {
        router.push(`/project/${project.id}`);
      } else {
        alert('Error saving project.');
      }
    } catch (err) {
      alert('Failed to save project workspace.');
    }
  };

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center text-graphite text-[14px]">Initializing session...</div>;

  if (draft) {
    return (
      <div className="flex-1 max-w-4xl mx-auto w-full p-6 pt-12">
        <div className="bg-cream-paper hairline-border rounded-cards p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[24px] font-medium text-ink flex items-center">
              <CheckCircle className="w-6 h-6 text-mint-signal mr-3" />
              Prompt Package Ready
            </h2>
            <button
              onClick={handleSaveProject}
              className="inline-flex items-center justify-center h-10 px-6 bg-sunshine-highlight text-ink rounded-buttons font-medium text-[14px] hover:opacity-90 transition-opacity"
            >
              Save Project <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
          <div className="bg-white hairline-border-muted p-4 rounded-inputs overflow-y-auto max-h-[600px] whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
            {draft.finalPrompt}
          </div>
        </div>
      </div>
    );
  }

  if (reviewMode) {
    return (
      <div className="flex-1 max-w-4xl mx-auto w-full p-6 lg:p-12 relative pb-24">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-medium text-ink mb-2">Final Review</h1>
            <p className="text-[16px] text-graphite">Please verify your setup before we generate the system prompt.</p>
          </div>
          <button 
            onClick={() => setReviewMode(false)}
            className="flex items-center px-4 py-2 rounded-buttons hairline-border bg-white text-ink hover:bg-black/5 text-[14px] font-medium transition-colors"
          >
            <Edit3 className="w-4 h-4 mr-2" /> Edit Form
          </button>
        </div>

        <div className="bg-cream-paper hairline-border rounded-cards p-8 mb-6">
          <h2 className="text-[20px] font-medium text-ink mb-4">Identity & Basics</h2>
          <SummaryItem label="Company Name" value={formData.companyName} />
          <SummaryItem label="Call Direction" value={formData.callDirection} />
          <SummaryItem label="Primary Goal" value={formData.goalPreset === 'Other' ? formData.goalOther : formData.goalPreset} />
          <SummaryItem label="Language Mode" value={formData.language} />
          {formData.language === 'Multilingual' && <SummaryItem label="Sub Languages" value={formData.subLanguages.join(', ')} />}
          <SummaryItem label="Physical Address" value={formData.isRemote ? 'Remote' : formData.address} />
          <SummaryItem label="Phone / Website" value={[formData.phone ? `${formData.phoneCode} ${formData.phone}` : '', formData.website].filter(Boolean).join(' | ')} />
        </div>

        <div className="bg-cream-paper hairline-border rounded-cards p-8 mb-6">
          <h2 className="text-[20px] font-medium text-ink mb-4">Team & Services</h2>
          <SummaryItem label="Staff List" value={formData.staffList.filter(s => s.name).map(s => `${s.name} (${s.role})`).join(', ')} />
          <SummaryItem label="Services Offered" value={formData.services.filter(s => s.name).map(s => `${s.name}: ${s.desc}`).join('\n')} />
          <SummaryItem label="Intake Requirements" value={[...formData.intakeReqs].filter(Boolean).join(', ')} />
          <SummaryItem label="Pre-call Context" value={formData.preCallFields.join(', ')} />
        </div>

        <div className="bg-cream-paper hairline-border rounded-cards p-8 mb-6">
          <h2 className="text-[20px] font-medium text-ink mb-4">Policies & Mechanics</h2>
          <SummaryItem label="General FAQs" value={formData.faqsText} />
          <SummaryItem label="Custom Policies" value={formData.policies.filter(p => p.desc).map(p => `${p.type}: ${p.desc}`).join('\n')} />
          <SummaryItem label="Live Transfer" value={formData.transferEnabled ? `Yes (To: ${formData.transferNumbers.map(n => n.label).join(', ')})` : 'No'} />
          <SummaryItem label="Voice & Tone" value={[formData.voiceGender, ...formData.toneWords].join(', ')} />
          {formData.needsConfirmation && <SummaryItem label="Confirmation" value={`Confirms: ${formData.confirmationScope} (via ${formData.confirmationStyle})`} />}
          <SummaryItem label="Call Flow Description" value={formData.callFlowDescription} />
        </div>

        {Object.entries(clarificationAnswers).length > 0 && (
          <div className="bg-cream-paper hairline-border rounded-cards p-8 mb-6 border-sunshine-highlight border-l-4">
            <h2 className="text-[20px] font-medium text-ink mb-4 flex items-center">
              <Bot className="w-5 h-5 text-sunshine-highlight mr-2" />
              Judge Clarifications
            </h2>
            {Object.entries(clarificationAnswers).map(([idx, ans]) => (
              <div key={idx} className="mb-4 flex flex-col gap-1">
                <div className="text-[16px] text-ink/90">
                  <span className="font-bold text-ink">Question:</span> {clarificationQuestions[Number(idx)]}
                </div>
                <div className="text-[16px] text-ink/90 whitespace-pre-wrap">
                  <span className="font-bold text-ink">Answer:</span> {ans}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-cream-paper border-t hairline-border-muted p-4 z-50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <span className="text-[14px] text-graphite font-medium">Ready to compile</span>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center justify-center h-12 px-8 bg-ink text-cream-paper rounded-buttons font-medium text-[16px] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {generating ? (
                <span className="flex items-center"><span className="w-4 h-4 rounded-full border-2 border-cream-paper border-t-transparent animate-spin mr-2" /> Compiling...</span>
              ) : (
                <span className="flex items-center">Generate Prompt <ArrowRight className="w-4 h-4 ml-2" /></span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-12 relative">
      <div className="mb-8">
        <h1 className="text-[32px] font-medium text-ink mb-2">Build your Agent</h1>
        <p className="text-[16px] text-graphite">Fill out the blueprint below to automatically architect a production-grade system prompt.</p>
      </div>
      
      <BuilderForm data={formData} setData={setFormData} phoneError={phoneError} />

      {/* Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-cream-paper border-t hairline-border-muted p-4 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-[14px] text-graphite font-medium">Session: {sessionId.slice(0, 8)}...</span>
          <button
            onClick={handleEvaluate}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center h-12 px-8 bg-ink text-cream-paper rounded-buttons font-medium text-[16px] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center"><span className="w-4 h-4 rounded-full border-2 border-cream-paper border-t-transparent animate-spin mr-2" /> Processing...</span>
            ) : (
              <span className="flex items-center">Review & Build <ArrowRight className="w-4 h-4 ml-2" /></span>
            )}
          </button>
        </div>
      </div>

      {/* Clarification Modal Overlay */}
      {clarificationQuestions.length > 0 && !reviewMode && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-cream-paper hairline-border rounded-cards w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-sunshine-highlight flex items-center justify-center">
                <Bot className="w-5 h-5 text-ink" />
              </div>
              <div>
                <h3 className="text-[20px] font-medium text-ink">A few clarifying questions</h3>
                <p className="text-[14px] text-graphite">Our LLM Judge needs a bit more detail before compiling the prompt.</p>
              </div>
            </div>
            
            <div className="space-y-6">
              {clarificationQuestions.map((q, idx) => (
                <div key={idx} className="space-y-2">
                  <label className="text-[16px] font-medium text-ink block">{idx + 1}. {q}</label>
                  <textarea
                    rows={2}
                    className="w-full bg-transparent hairline-border-muted rounded-inputs px-3 py-2 text-[16px] text-ink placeholder-graphite focus:outline-none focus:hairline-border transition-colors resize-y"
                    placeholder="Your answer..."
                    value={clarificationAnswers[idx] || ''}
                    onChange={(e) => setClarificationAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setClarificationQuestions([])}
                className="px-6 py-2 rounded-buttons hairline-border text-ink hover:bg-black/5 font-medium text-[14px] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmitClarifications}
                className="px-6 py-2 rounded-buttons bg-ink text-cream-paper hover:opacity-90 font-medium text-[14px] transition-opacity flex items-center"
              >
                Submit Answers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
