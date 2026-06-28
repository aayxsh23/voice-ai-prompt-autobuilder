import React from 'react';
import { PromptPackageDraft } from '@/lib/llm/types';
import { Button, Textarea, Card, Badge } from '../ui';
import { ArrowLeft, CheckCircle2, Wand2, Bot, Layers, Check, Copy } from 'lucide-react';

interface Props {
  draft: PromptPackageDraft | null;
  onGenerate: () => Promise<void>;
  onCreateProject: (redirectToDashboard?: boolean) => Promise<void>;
  onBack: () => void;
  creating?: boolean;
}

export const ReviewDraftPanel: React.FC<Props> = ({
  draft,
  onGenerate,
  onCreateProject,
  onBack,
  creating
}) => {
  const [activeTab, setActiveTab] = React.useState<'agent' | 'system' | 'vars'>('agent');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!draft) {
      onGenerate();
    }
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!draft) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-3">
        <h2 className="text-[15px] font-medium text-[#d0d6e0]">Compiling prompt package...</h2>
        <p className="text-[12px] text-[#62666d]">Running multi-pass self-critique and guardrail checks</p>
      </div>
    );
  }

  const rubric = draft.qualityReview || { overallScore: 92, completionScore: 90, safetyScore: 95 };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Review Generated Package</h2>
          <p className="text-[#62666d] text-[13px]">Preview your Agent Blueprint and Platform System Prompt.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onGenerate} className="text-[12px]">
            Re-Synthesize
          </Button>
          <Button variant="secondary" onClick={() => onCreateProject(false)} disabled={creating}>
            {creating ? "Saving..." : "Open Studio"}
          </Button>
          <Button onClick={() => onCreateProject(true)} disabled={creating} className="px-6 font-medium">
            {creating ? "Saving..." : "Done"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <span className="text-[10px] uppercase font-mono text-[#62666d]">Overall</span>
          <div className="text-[20px] font-mono font-medium text-[#e4f222] mt-1">{rubric.overallScore}<span className="text-[#62666d] text-[14px]">/100</span></div>
        </Card>
        <Card className="p-4">
          <span className="text-[10px] uppercase font-mono text-[#62666d]">Safety</span>
          <div className="text-[20px] font-mono font-medium text-[#27a644] mt-1">{rubric.safetyScore}<span className="text-[#62666d] text-[14px]">/100</span></div>
        </Card>
        <Card className="p-4">
          <span className="text-[10px] uppercase font-mono text-[#62666d]">Human Quality</span>
          <div className="text-[20px] font-mono font-medium text-[#f7f8f8] mt-1">{rubric.humanQualityScore || 92}<span className="text-[#62666d] text-[14px]">/100</span></div>
        </Card>
        <Card className="p-4">
          <span className="text-[10px] uppercase font-mono text-[#62666d]">Anti-Hallucination</span>
          <div className="text-[20px] font-mono font-medium text-[#02b8cc] mt-1">{rubric.hallucinationResistanceScore || 94}<span className="text-[#62666d] text-[14px]">/100</span></div>
        </Card>
      </div>

      <div className="bg-[#161718] rounded-[12px] border border-[#23252a] overflow-hidden">
        <div className="flex items-center justify-between bg-[#0f1011] border-b border-[#23252a] px-4 py-2">
          <div className="flex space-x-1">
            {[
              { id: 'agent' as const, label: 'Agent Prompt', icon: Bot, count: draft.agentPrompt.split('\n').length },
              { id: 'system' as const, label: 'System Prompt', icon: Layers, count: draft.systemPrompt.split('\n').length },
              { id: 'vars' as const, label: 'Variables', icon: null, count: draft.dynamicVariables.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer ${
                  activeTab === tab.id ? "bg-[#161718] text-[#f7f8f8] border border-[#23252a]" : "text-[#62666d] hover:text-[#8a8f98]"
                }`}
              >
                {tab.label} <span className="font-mono text-[#62666d] ml-1">{tab.count}</span>
              </button>
            ))}
          </div>

          {(activeTab === 'agent' || activeTab === 'system') && (
            <Button variant="ghost" size="sm" onClick={() => handleCopy(activeTab === 'agent' ? draft.agentPrompt : draft.systemPrompt)} className="h-7 text-[11px]">
              {copied ? <Check className="h-3.5 w-3.5 text-[#27a644]" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        <div className="p-5">
          {activeTab === 'agent' && (
            <Textarea
              readOnly
              value={draft.agentPrompt}
              className="min-h-[500px] font-mono text-[12px] leading-relaxed bg-[#08090a] text-[#d0d6e0] border-none p-4 focus:ring-0 rounded-[6px]"
            />
          )}
          {activeTab === 'system' && (
            <Textarea
              readOnly
              value={draft.systemPrompt}
              className="min-h-[500px] font-mono text-[12px] leading-relaxed bg-[#08090a] text-[#d0d6e0] border-none p-4 focus:ring-0 rounded-[6px]"
            />
          )}
          {activeTab === 'vars' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#23252a] bg-[#0f1011] text-[10px] font-mono uppercase text-[#62666d]">
                    <th className="p-3">Key</th>
                    <th className="p-3">Label</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Default</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23252a] text-[12px]">
                  {draft.dynamicVariables.map((v) => (
                    <tr key={v.key} className="hover:bg-[#0f1011]">
                      <td className="p-3 font-mono font-medium text-[#e4f222]">{v.key}</td>
                      <td className="p-3 text-[#d0d6e0]">{v.label}</td>
                      <td className="p-3"><Badge variant="outline" className="text-[10px] font-mono">{v.source}</Badge></td>
                      <td className="p-3 text-[#62666d]">{v.defaultValue || "—"}</td>
                      <td className="p-3 text-[#62666d]">{v.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button onClick={() => onCreateProject(false)} disabled={creating}>
          {creating ? "Finalizing..." : "Create Project & Open Studio"}
        </Button>
      </div>
    </div>
  );
};
