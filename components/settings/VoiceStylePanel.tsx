import React from 'react';
import { Card, Input } from '../ui';

export const VoiceStylePanel: React.FC<{ project: any; onChange: (key: string, val: any) => void }> = ({ project, onChange }) => {
  let bp: any = {};
  try { bp = JSON.parse(project.blueprintJson || "{}"); } catch {}
  const pers = bp.personality || {};

  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">Voice Style</h3>
        <p className="text-[11px] text-[#62666d]">Fine-tune vocal characteristics before TTS synthesis.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
        <div>
          <label className="block font-medium text-[#d0d6e0] mb-1.5">Tone</label>
          <Input defaultValue={pers.tone || "Professional, warm"} onBlur={e => {
            const updatedPers = { ...pers, tone: e.target.value };
            onChange('blueprintJson', JSON.stringify({ ...bp, personality: updatedPers }));
          }} />
        </div>
        <div>
          <label className="block font-medium text-[#d0d6e0] mb-1.5">Pace</label>
          <Input defaultValue={pers.pace || "Moderate"} onBlur={e => {
            const updatedPers = { ...pers, pace: e.target.value };
            onChange('blueprintJson', JSON.stringify({ ...bp, personality: updatedPers }));
          }} />
        </div>
      </div>
    </Card>
  );
};
