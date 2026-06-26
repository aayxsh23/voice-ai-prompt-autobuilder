import React from 'react';
import { Card, Button, Badge } from '../ui';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  project: any;
  onReEvaluate: () => Promise<void>;
}

export const QualityScoreCard: React.FC<Props> = ({ project, onReEvaluate }) => {
  const [evaluating, setEvaluating] = React.useState(false);

  const handleEval = async () => {
    setEvaluating(true);
    await onReEvaluate();
    setEvaluating(false);
  };

  const metrics = [
    { label: "Overall", value: project.qualityScore, color: "text-[#e4f222]" },
    { label: "Safety", value: project.safetyScore, color: "text-[#27a644]" },
    { label: "Completion", value: project.completionScore, color: "text-[#f7f8f8]" },
    { label: "Voice Style", value: project.voiceStyleScore, color: "text-[#f7f8f8]" },
    { label: "Structure", value: project.structureScore, color: "text-[#f7f8f8]" },
    { label: "Edge Cases", value: project.edgeCaseScore, color: "text-[#f7f8f8]" },
    { label: "Anti-Hallucination", value: project.hallucinationResistanceScore, color: "text-[#02b8cc]" },
    { label: "Min. Edit Rubric", value: project.minimumManualEditScore, color: "text-[#f7f8f8]" },
  ];

  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#23252a] pb-4">
        <div className="flex items-center space-x-3">
          <div className="h-11 w-11 rounded-[6px] bg-[#0f1011] border border-[#23252a] flex items-center justify-center text-[14px] font-mono font-medium text-[#e4f222]">
            {project.qualityScore}%
          </div>
          <div>
            <h3 className="font-medium text-[#f7f8f8] text-[14px]">Quality Radar</h3>
            <p className="text-[11px] text-[#62666d]">Multi-dimensional telephony production rubrics</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={handleEval} disabled={evaluating} className="text-[11px]">
          <RefreshCw className={`mr-1.5 h-3 w-3 ${evaluating ? "animate-spin" : ""}`} /> Re-Evaluate
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="p-3 rounded-[6px] bg-[#0f1011] border border-[#23252a]">
            <span className="block text-[10px] uppercase font-mono text-[#62666d]">{m.label}</span>
            <div className="flex items-center justify-between mt-1.5">
              <span className={`text-[16px] font-mono font-medium ${m.color}`}>{m.value || 90}%</span>
              <div className="w-10 bg-[#23252a] rounded-full h-1 overflow-hidden">
                <div className="bg-[#e4f222] h-1 rounded-full" style={{ width: `${m.value || 90}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {(project.qualityIssues || []).length > 0 ? (
        <div className="space-y-2 pt-2">
          <span className="text-[12px] font-medium text-[#eb5757] flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Flagged Issues
          </span>
          {project.qualityIssues.map((issue: any, idx: number) => (
            <div key={idx} className="p-3 rounded-[6px] bg-[#0f1011] border border-[#eb5757]/20 text-[12px] text-[#d0d6e0] flex justify-between items-start">
              <span><strong className="text-[#eb5757] font-mono text-[10px]">{issue.severity.toUpperCase()}</strong> {issue.issue}</span>
              {issue.fix && <Badge variant="warning" className="text-[10px] ml-2">{issue.fix}</Badge>}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 rounded-[6px] bg-[#0f1011] border border-[#27a644]/20 text-[12px] text-[#8a8f98] flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#27a644]" />
          <span>No critical prompt issues detected.</span>
        </div>
      )}
    </Card>
  );
};
