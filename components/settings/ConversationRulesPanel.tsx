import React from 'react';
import { Card, Textarea } from '../ui';

export const ConversationRulesPanel: React.FC<{ project: any; onChange: (key: string, val: any) => void }> = ({ project, onChange }) => {
  let bp: any = {};
  try { bp = JSON.parse(project.blueprintJson || "{}"); } catch {}
  const conv = bp.conversation || {};

  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">Readback Rules</h3>
        <p className="text-[11px] text-[#62666d]">Enforce strict verbal verification before committing writes.</p>
      </div>
      <div>
        <Textarea
          defaultValue={(conv.confirmationRules || []).join('\n')}
          onBlur={e => {
            conv.confirmationRules = e.target.value.split('\n').filter(Boolean);
            onChange('blueprintJson', JSON.stringify({ ...bp, conversation: conv }));
          }}
          className="text-[12px] min-h-[120px] font-sans"
        />
      </div>
    </Card>
  );
};
