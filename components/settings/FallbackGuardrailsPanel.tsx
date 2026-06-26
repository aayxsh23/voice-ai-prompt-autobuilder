import React from 'react';
import { Card, Textarea } from '../ui';

export const FallbackGuardrailsPanel: React.FC<{ project: any; onChange: (key: string, val: any) => void }> = ({ project, onChange }) => {
  let bp: any = {};
  try { bp = JSON.parse(project.blueprintJson || "{}"); } catch {}
  const conv = bp.conversation || {};

  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">Fallback Recovery</h3>
        <p className="text-[11px] text-[#62666d]">Define what the agent says when speech is unintelligible or out of scope.</p>
      </div>
      <div>
        <Textarea
          defaultValue={(conv.fallbackRules || ["If caller speech indistinct, ask to repeat.", "If out of scope, state specialist will callback."]).join('\n')}
          onBlur={e => {
            conv.fallbackRules = e.target.value.split('\n').filter(Boolean);
            onChange('blueprintJson', JSON.stringify({ ...bp, conversation: conv }));
          }}
          className="text-[12px] min-h-[120px] font-sans"
        />
      </div>
    </Card>
  );
};
