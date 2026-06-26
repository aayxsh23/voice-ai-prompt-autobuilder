import React from 'react';
import { Card, Textarea, Button } from '../ui';
import { Save } from 'lucide-react';

export const PostConversationSummaryPromptPanel: React.FC<{ project: any }> = ({ project }) => {
  const [val, setVal] = React.useState(`Analyze the transcript of the call with ${project.name}. Extract: 1. Caller Intent, 2. Key Collected Variables, 3. Call Outcome (Booked / Escalated / Callback Logged), 4. Action Items for CRM.`);
  const [saved, setSaved] = React.useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3 flex justify-between items-center">
        <div>
          <h3 className="font-medium text-[#f7f8f8] text-[14px]">Webhook Summary Prompt</h3>
          <p className="text-[11px] text-[#62666d]">Prompt specification used by your backend webhook after call termination.</p>
        </div>
        <Button size="sm" onClick={handleSave} className="h-7 text-[11px]">
          <Save className="h-3 w-3 mr-1" /> {saved ? "Saved" : "Save"}
        </Button>
      </div>
      <div>
        <Textarea
          value={val}
          onChange={e => setVal(e.target.value)}
          className="text-[12px] font-mono min-h-[140px] bg-[#08090a] text-[#d0d6e0] border-none p-4"
        />
      </div>
    </Card>
  );
};
