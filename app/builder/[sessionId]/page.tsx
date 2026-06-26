'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { BuilderStepper } from '@/components/builder/BuilderStepper';
import { UseCaseSelector } from '@/components/builder/UseCaseSelector';
import { BusinessSnapshotForm } from '@/components/builder/BusinessSnapshotForm';
import { CallMissionForm } from '@/components/builder/CallMissionForm';
import { ConversationDesignEditor } from '@/components/builder/ConversationDesignEditor';
import { PersonalityDesigner } from '@/components/builder/PersonalityDesigner';
import { GapQuestionsForm } from '@/components/builder/GapQuestionsForm';
import { ReviewDraftPanel } from '@/components/builder/ReviewDraftPanel';
import { USE_CASE_TEMPLATES } from '@/lib/templates';
import {
  BusinessSnapshot,
  CallMission,
  ConversationDesign,
  VoicePersonality,
  GapAuditResult,
  PromptPackageDraft
} from '@/lib/llm/types';

export default function BuilderSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = React.useState<string>('');
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);

  // Pipeline state
  const [templateId, setTemplateId] = React.useState('clinic_receptionist');
  const [business, setBusiness] = React.useState<BusinessSnapshot>({
    businessName: 'Apex Healthcare Clinic',
    industry: 'Healthcare',
    description: 'Family practice clinic offering routine checkups, urgent nurse triage, and vaccinations.',
    services: ['General Consultation', 'Blood Tests', 'Vaccinations'],
    location: '100 Medical Way, Suite 400',
    operatingHours: 'Mon-Fri 8am-6pm',
    callerTypes: ['New Patients', 'Returning Patients'],
    languageStyle: 'Warm everyday American English',
    restrictedClaims: ['No medical diagnoses', 'No guaranteed prescription refills']
  });
  const [mission, setMission] = React.useState<CallMission>({
    primaryGoal: 'Book patient appointments and escalate urgent symptoms',
    supportedIntents: ['book appointment', 'reschedule', 'cancel', 'clinic hours', 'nurse callback'],
    allowedActions: ['check availability', 'create booking', 'log callback'],
    escalationTriggers: ['chest pain', 'shortness of breath', 'severe bleeding', 'suicide risk'],
    transferPhoneNumber: '+1 (555) 019-9999',
    successCriteria: ['Captured patient name and phone', 'Confirmed slot verbal readback'],
    confirmationRequiredFor: ['booking commitment', 'cancellation']
  });
  const [conversation, setConversation] = React.useState<ConversationDesign>({
    opening: 'Hello, thank you for calling Apex Healthcare. My name is Sarah. How can I assist you today?',
    intentDetection: ['Listen for appointment request keywords'],
    intents: [],
    confirmationRules: ['Read back appointment date and time clearly before confirming.'],
    fallbackRules: ['If speech indistinct, politely ask caller to repeat.'],
    closingRules: ['Wish caller a wonderful day.']
  });
  const [personality, setPersonality] = React.useState<VoicePersonality>({
    tone: 'Warm, empathetic, professional, calm',
    pace: 'Moderate, unhurried',
    empathyLevel: 'High clinical empathy',
    phrasesToUse: ['Certainly, let me check our schedule for you.', 'I would be glad to help with that.'],
    phrasesToAvoid: ['As an AI...', 'I cannot diagnose...']
  });
  const [auditResult, setAuditResult] = React.useState<GapAuditResult | null>(null);
  const [gapAnswers, setGapAnswers] = React.useState<Record<string, string>>({});
  const [reviewDraft, setReviewDraft] = React.useState<PromptPackageDraft | null>(null);

  React.useEffect(() => {
    params.then(p => {
      setSessionId(p.sessionId);
      setLoading(false);
    });
  }, [params]);

  const saveSessionStep = async (newStep: number) => {
    setStep(newStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (sessionId) {
      await fetch(`/api/builder/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep: newStep,
          selectedTemplate: templateId,
          useCase: templateId,
          industry: business.industry
        })
      }).catch(() => {});
    }
  };

  const handleSelectTemplate = (tmpl: any) => {
    setTemplateId(tmpl.id || tmpl.name);
    setBusiness(b => ({
      ...b,
      industry: tmpl.industry,
      description: tmpl.description
    }));
    setConversation(c => ({
      ...c,
      opening: `Hello, thank you for calling ${business.businessName}. How can I help you today?`
    }));
  };

  const handleAutoGenerateConversation = async () => {
    const res = await fetch('/api/builder/generate-conversation-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: templateId, business, mission })
    });
    const data = await res.json();
    if (data && data.opening) {
      setConversation(data);
    }
  };

  const handleRunGapAudit = async () => {
    const res = await fetch('/api/builder/gap-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business, mission, conversation, personality })
    });
    const data = await res.json();
    if (data) setAuditResult(data);
  };

  const handleCompileDraft = async () => {
    setReviewDraft(null);
    const res = await fetch('/api/builder/generate-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useCase: templateId,
        selectedTemplate: templateId,
        business,
        mission,
        conversation,
        personality,
        followupAnswers: gapAnswers
      })
    });
    const data = await res.json();
    if (data) setReviewDraft(data);
  };

  const handleCreateProject = async (redirectToDashboard = false) => {
    setCreating(true);
    const res = await fetch('/api/builder/create-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        draft: reviewDraft,
        blueprint: {
          useCase: templateId,
          selectedTemplate: templateId,
          business,
          mission,
          conversation,
          personality,
          followupAnswers: gapAnswers
        }
      })
    });
    const project = await res.json();
    if (project && project.id) {
      if (redirectToDashboard) {
        router.push('/dashboard');
      } else {
        router.push(`/project/${project.id}`);
      }
    } else {
      setCreating(false);
      alert("Error creating project workspace.");
    }
  };

  if (loading) return <div className="p-20 text-center text-[#62666d]">Loading session...</div>;

  return (
    <div className="flex-1 flex flex-col pb-20">
      <BuilderStepper currentStep={step} onStepClick={s => saveSessionStep(s)} />

      <div className="flex-1 px-4 sm:px-8">
        {step === 1 && (
          <UseCaseSelector
            selectedId={templateId}
            onSelect={handleSelectTemplate}
            onNext={() => saveSessionStep(2)}
          />
        )}

        {step === 2 && (
          <BusinessSnapshotForm
            data={business}
            onChange={setBusiness}
            onBack={() => saveSessionStep(1)}
            onNext={() => saveSessionStep(3)}
          />
        )}

        {step === 3 && (
          <CallMissionForm
            data={mission}
            onChange={setMission}
            onBack={() => saveSessionStep(2)}
            onNext={() => saveSessionStep(4)}
          />
        )}

        {step === 4 && (
          <ConversationDesignEditor
            data={conversation}
            onChange={setConversation}
            onBack={() => saveSessionStep(3)}
            onNext={() => saveSessionStep(5)}
            onAutoGenerate={handleAutoGenerateConversation}
          />
        )}

        {step === 5 && (
          <PersonalityDesigner
            data={personality}
            onChange={setPersonality}
            onBack={() => saveSessionStep(4)}
            onNext={() => saveSessionStep(6)}
          />
        )}

        {step === 6 && (
          <GapQuestionsForm
            auditResult={auditResult}
            answers={gapAnswers}
            onAnswerChange={(k, v) => setGapAnswers(a => ({ ...a, [k]: v }))}
            onRunAudit={handleRunGapAudit}
            onBack={() => saveSessionStep(5)}
            onNext={() => {
              saveSessionStep(7);
              handleCompileDraft();
            }}
          />
        )}

        {(step === 7 || step === 8) && (
          <ReviewDraftPanel
            draft={reviewDraft}
            onGenerate={handleCompileDraft}
            onCreateProject={handleCreateProject}
            onBack={() => saveSessionStep(6)}
            creating={creating}
          />
        )}
      </div>
    </div>
  );
}
