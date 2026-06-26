import React from 'react';
import { VoicePersonality } from '@/lib/llm/types';
import { Input, Textarea, Button } from '../ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  data: VoicePersonality;
  onChange: (data: VoicePersonality) => void;
  onNext: () => void;
  onBack: () => void;
}

export const PersonalityDesigner: React.FC<Props> = ({ data, onChange, onNext, onBack }) => {
  const updateField = (key: keyof VoicePersonality, val: any) => {
    onChange({ ...data, [key]: val });
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Voice Personality & Phrasing</h2>
        <p className="text-[#62666d] text-[13px]">Configure tone, vocal cadence, empathy, and specific phrases to avoid.</p>
      </div>

      <div className="bg-[#161718] p-6 rounded-[12px] border border-[#23252a] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Vocal Tone</label>
            <Input
              value={data.tone || ''}
              onChange={e => updateField('tone', e.target.value)}
              placeholder="Warm, reassuring, articulate"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Speaking Pace</label>
            <Input
              value={data.pace || ''}
              onChange={e => updateField('pace', e.target.value)}
              placeholder="Moderate, unhurried"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Empathy Level</label>
          <Input
            value={data.empathyLevel || ''}
            onChange={e => updateField('empathyLevel', e.target.value)}
            placeholder="High clinical empathy"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Signature Phrases (one per line)</label>
            <Textarea
              value={(data.phrasesToUse || []).join('\n')}
              onChange={e => updateField('phrasesToUse', e.target.value.split('\n').filter(Boolean))}
              placeholder="Certainly, I'd be happy to arrange that."
              className="font-sans text-[12px] min-h-[100px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Phrases to Avoid (one per line)</label>
            <Textarea
              value={(data.phrasesToAvoid || []).join('\n')}
              onChange={e => updateField('phrasesToAvoid', e.target.value.split('\n').filter(Boolean))}
              placeholder="As an AI language model..."
              className="font-sans text-[12px] min-h-[100px]"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button onClick={onNext}>Next: Readiness Check <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  );
};
