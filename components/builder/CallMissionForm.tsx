import React from 'react';
import { CallMission } from '@/lib/llm/types';
import { Input, Button } from '../ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  data: CallMission;
  onChange: (data: CallMission) => void;
  onNext: () => void;
  onBack: () => void;
}

export const CallMissionForm: React.FC<Props> = ({ data, onChange, onNext, onBack }) => {
  const updateField = (key: keyof CallMission, val: any) => {
    onChange({ ...data, [key]: val });
  };

  const handleArrayField = (key: keyof CallMission, raw: string) => {
    const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
    updateField(key, arr);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Call Mission & Boundaries</h2>
        <p className="text-[#62666d] text-[13px]">Define what success looks like and establish rigid execution guardrails.</p>
      </div>

      <div className="bg-[#161718] p-6 rounded-[12px] border border-[#23252a] space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Primary Agent Goal</label>
          <Input
            value={data.primaryGoal || ''}
            onChange={e => updateField('primaryGoal', e.target.value)}
            placeholder="e.g. Schedule new patient consultations and triage urgent dental pains"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Supported Caller Intents (comma separated)</label>
          <Input
            defaultValue={(data.supportedIntents || []).join(', ')}
            onBlur={e => handleArrayField('supportedIntents', e.target.value)}
            placeholder="book appointment, reschedule, billing question, emergency triage"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Allowed Runtime Actions (comma separated)</label>
          <Input
            defaultValue={(data.allowedActions || []).join(', ')}
            onBlur={e => handleArrayField('allowedActions', e.target.value)}
            placeholder="check calendar slots, insert booking record, send SMS confirmation"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Escalation Triggers</label>
            <Input
              defaultValue={(data.escalationTriggers || []).join(', ')}
              onBlur={e => handleArrayField('escalationTriggers', e.target.value)}
              placeholder="severe pain, profuse bleeding, abusive swearing"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Transfer Number</label>
            <Input
              value={data.transferPhoneNumber || ''}
              onChange={e => updateField('transferPhoneNumber', e.target.value)}
              placeholder="+1 (555) 019-9999"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Verbal Confirmation Required For</label>
          <Input
            defaultValue={(data.confirmationRequiredFor || []).join(', ')}
            onBlur={e => handleArrayField('confirmationRequiredFor', e.target.value)}
            placeholder="appointment time commitments, cancellation submissions"
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button onClick={onNext}>Next: Conversation Design <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  );
};
