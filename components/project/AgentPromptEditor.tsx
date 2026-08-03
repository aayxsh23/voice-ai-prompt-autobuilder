import React from 'react';
import { Button } from '../ui';
import { Copy, Check } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSave: () => Promise<void>;
  saving?: boolean;
}

export const AgentPromptEditor: React.FC<Props> = ({ value, onChange, onSave, saving }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card flex min-h-0 flex-1 flex-col overflow-hidden animate-slide-up">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="text-[13px] font-medium text-ink">System prompt</span>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label="System prompt"
        className="flex-1 resize-none border-0 bg-surface p-4 font-mono text-[13px] leading-[1.6] text-ink-soft outline-none"
      />
    </div>
  );
};
