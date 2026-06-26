import React from 'react';
import { ConversationDesign } from '@/lib/llm/types';
import { Input, Textarea, Button } from '../ui';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';

interface Props {
  data: ConversationDesign;
  onChange: (data: ConversationDesign) => void;
  onNext: () => void;
  onBack: () => void;
  onAutoGenerate?: () => Promise<void>;
}

export const ConversationDesignEditor: React.FC<Props> = ({ data, onChange, onNext, onBack, onAutoGenerate }) => {
  const [loading, setLoading] = React.useState(false);

  const handleGenerate = async () => {
    if (!onAutoGenerate) return;
    setLoading(true);
    await onAutoGenerate();
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Conversation Design Map</h2>
          <p className="text-[#62666d] text-[13px]">Fine-tune the vocal greeting, slot collection questions, and response cards.</p>
        </div>
        {onAutoGenerate && (
          <Button variant="secondary" onClick={handleGenerate} disabled={loading} className="text-[12px]">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Auto-Synthesize
          </Button>
        )}
      </div>

      <div className="bg-[#161718] p-6 rounded-[12px] border border-[#23252a] space-y-6">
        <div>
          <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Spoken Opening Line</label>
          <Input
            value={data.opening || ''}
            onChange={e => onChange({ ...data, opening: e.target.value })}
            placeholder="Hello, thank you for calling Apex Dental..."
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-[13px] font-medium text-[#d0d6e0] border-b border-[#23252a] pb-2">Intent Slot Collection Handlers</h3>
          {(data.intents || []).map((intent, idx) => (
            <div key={idx} className="p-4 rounded-[6px] bg-[#0f1011] border border-[#23252a] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-[#e4f222] uppercase tracking-wide">{intent.intent}</span>
                <span className="text-[10px] text-[#62666d] font-mono">{intent.completionAction}</span>
              </div>
              <p className="text-[12px] text-[#8a8f98]">Required: {intent.requiredFields.join(', ')}</p>
              <div>
                <span className="text-[10px] font-medium text-[#62666d]">Questions:</span>
                <ul className="list-disc list-inside text-[12px] text-[#8a8f98] mt-1 space-y-0.5">
                  {intent.questionsToAsk.map((q, i) => <li key={i}>"{q}"</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Readback Confirmation Rules</label>
            <Textarea
              value={(data.confirmationRules || []).join('\n')}
              onChange={e => onChange({ ...data, confirmationRules: e.target.value.split('\n').filter(Boolean) })}
              className="font-sans text-[12px] min-h-[90px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">Fallback Speech Rules</label>
            <Textarea
              value={(data.fallbackRules || []).join('\n')}
              onChange={e => onChange({ ...data, fallbackRules: e.target.value.split('\n').filter(Boolean) })}
              className="font-sans text-[12px] min-h-[90px]"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button onClick={onNext}>Next: Voice Personality <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  );
};
