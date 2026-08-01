import React from 'react';
import { Card, Button, Textarea } from '../ui';
import { Save, Copy, Check } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSave: () => Promise<void>;
  saving?: boolean;
}

export const AgentPromptEditor: React.FC<Props> = ({ value, onChange, onSave, saving }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-full bg-white hairline-border rounded-cards shadow-sm">
      <div className="bg-cream-paper px-4 py-3 flex items-center justify-between border-b hairline-border-muted shrink-0">
        <span className="font-semibold text-[14px] text-ink">Prompt</span>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 text-[12px] text-graphite hover:text-ink hover:bg-black/5 rounded-buttons">
            {copied ? <Check className="h-4 w-4 mr-1.5 text-sunshine-highlight" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving} className="h-8 text-[12px] bg-ink text-cream-paper hover:opacity-90 rounded-buttons font-medium">
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex-1 p-0">
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-full min-h-[650px] bg-white text-ink font-mono text-[13px] leading-relaxed border-none rounded-none p-6 focus:ring-0 resize-none shadow-inner"
        />
      </div>
    </Card>
  );
};
