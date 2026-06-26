import React from 'react';
import { Card, Button, Textarea } from '../ui';
import { Save, Copy, Check } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSave: () => Promise<void>;
  saving?: boolean;
}

export const SystemPromptEditor: React.FC<Props> = ({ value, onChange, onSave, saving }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-full">
      <div className="bg-[#0f1011] px-4 py-2.5 flex items-center justify-between border-b border-[#23252a] shrink-0">
        <span className="font-mono text-[12px] text-[#8a8f98]">system_prompt.md</span>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-[11px]">
            {copied ? <Check className="h-3 w-3 mr-1 text-[#27a644]" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-[11px]">
            <Save className="h-3 w-3 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex-1 p-0">
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-full min-h-[650px] bg-[#08090a] text-[#d0d6e0] font-mono text-[12px] leading-relaxed border-none rounded-none p-5 focus:ring-0 resize-none"
        />
      </div>
    </Card>
  );
};
