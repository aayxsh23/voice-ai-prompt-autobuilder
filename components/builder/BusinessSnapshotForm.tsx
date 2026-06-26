import React from 'react';
import { BusinessSnapshot } from '@/lib/llm/types';
import { Input, Textarea, Button } from '../ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  data: BusinessSnapshot;
  onChange: (data: BusinessSnapshot) => void;
  onNext: () => void;
  onBack: () => void;
}

export const BusinessSnapshotForm: React.FC<Props> = ({ data, onChange, onNext, onBack }) => {
  const updateField = (key: keyof BusinessSnapshot, val: any) => {
    onChange({ ...data, [key]: val });
  };

  const handleServicesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    updateField('services', arr);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Business Snapshot</h2>
        <p className="text-[#62666d] text-[13px]">Provide foundational context about the organization the AI represents.</p>
      </div>

      <div className="bg-[#161718] p-6 rounded-[12px] border border-[#23252a] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Business Name</label>
            <Input
              value={data.businessName || ''}
              onChange={e => updateField('businessName', e.target.value)}
              placeholder="e.g. Apex Dental Care"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Industry</label>
            <Input
              value={data.industry || ''}
              onChange={e => updateField('industry', e.target.value)}
              placeholder="e.g. Healthcare"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Company Overview</label>
          <Textarea
            value={data.description || ''}
            onChange={e => updateField('description', e.target.value)}
            placeholder="Brief summary of what the business does..."
            className="font-sans min-h-[100px]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Location</label>
            <Input
              value={data.location || ''}
              onChange={e => updateField('location', e.target.value)}
              placeholder="e.g. 450 Medical Plaza, Suite 200"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Operating Hours</label>
            <Input
              value={data.operatingHours || ''}
              onChange={e => updateField('operatingHours', e.target.value)}
              placeholder="e.g. Mon-Fri 8am-6pm, Sat 9am-1pm"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Key Services (comma separated)</label>
          <Input
            defaultValue={(data.services || []).join(', ')}
            onBlur={handleServicesChange}
            placeholder="General Cleanings, Invisalign, Emergency Extraction"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Language Style</label>
            <Input
              value={data.languageStyle || ''}
              onChange={e => updateField('languageStyle', e.target.value)}
              placeholder="Standard American English"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Restricted Claims (comma separated)</label>
            <Input
              defaultValue={(data.restrictedClaims || []).join(', ')}
              onBlur={e => updateField('restrictedClaims', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="No guaranteed pain relief, no insurance billing guarantees"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button onClick={onNext}>Next: Call Mission <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  );
};
