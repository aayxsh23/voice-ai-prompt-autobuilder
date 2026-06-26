import React from 'react';
import { GapAuditResult } from '@/lib/llm/types';
import { Input, Button, Card, Badge } from '../ui';
import { ArrowLeft, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';

interface Props {
  auditResult: GapAuditResult | null;
  answers: Record<string, string>;
  onAnswerChange: (key: string, val: string) => void;
  onRunAudit: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export const GapQuestionsForm: React.FC<Props> = ({
  auditResult,
  answers,
  onAnswerChange,
  onRunAudit,
  onNext,
  onBack
}) => {
  const [auditing, setAuditing] = React.useState(false);

  const handleAudit = async () => {
    setAuditing(true);
    await onRunAudit();
    setAuditing(false);
  };

  React.useEffect(() => {
    if (!auditResult) {
      handleAudit();
    }
  }, []);

  const missing = auditResult?.missingCriticalDetails || [];

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Readiness Check</h2>
          <p className="text-[#62666d] text-[13px]">Automated audit for missing critical details or safety blindspots.</p>
        </div>
        <Button variant="secondary" onClick={handleAudit} disabled={auditing} className="text-[12px]">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${auditing ? "animate-spin" : ""}`} /> Re-Audit
        </Button>
      </div>

      {auditResult && (
        <Card className="flex items-center justify-between p-5">
          <div className="flex items-center space-x-4">
            <div className="h-11 w-11 rounded-full bg-[#0f1011] flex items-center justify-center text-[15px] font-mono font-medium text-[#e4f222] border border-[#23252a]">
              {auditResult.readinessScore}%
            </div>
            <div>
              <h3 className="font-medium text-[#f7f8f8] text-[14px]">Blueprint Readiness</h3>
              <p className="text-[12px] text-[#62666d]">
                {missing.length === 0 ? "All critical details captured." : `${missing.length} items recommended.`}
              </p>
            </div>
          </div>
          <Badge variant={missing.length === 0 ? "success" : "warning"} className="text-[11px] px-3 py-1">
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${missing.length === 0 ? 'bg-[#27a644]' : 'bg-[#eb5757]'}`} />
            {missing.length === 0 ? "Ready" : "Needs Review"}
          </Badge>
        </Card>
      )}

      {missing.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-[13px] font-medium text-[#d0d6e0]">Recommended Clarifications</h3>
          {missing.map((item) => (
            <div key={item.field} className="p-5 bg-[#0f1011] rounded-[12px] border border-[#23252a] space-y-3">
              <div className="flex items-start justify-between">
                <span className="font-medium text-[13px] text-[#f7f8f8]">{item.field}</span>
                <span className="text-[10px] bg-[#161718] text-[#62666d] px-2 py-0.5 rounded-[2px] font-mono">
                  {item.recommendedDefault}
                </span>
              </div>
              <p className="text-[12px] text-[#62666d] leading-relaxed"><strong className="text-[#8a8f98]">Why it matters:</strong> {item.whyItMatters}</p>
              <div className="pt-1">
                <label className="block text-[12px] font-medium text-[#d0d6e0] mb-1.5">{item.questionToAskUser}</label>
                <Input
                  value={answers[item.field] || ''}
                  onChange={e => onAnswerChange(item.field, e.target.value)}
                  placeholder={item.recommendedDefault}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center bg-[#161718] rounded-[12px] border border-[#27a644]/30 space-y-2">
          <ShieldCheck className="h-8 w-8 text-[#27a644] mx-auto" />
          <h3 className="font-medium text-[#d0d6e0] text-[14px]">Blueprint Passed Audit</h3>
          <p className="text-[12px] text-[#62666d] max-w-md mx-auto">
            Your configuration contains all required business hours, boundaries, readback rules, and safety paths.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button onClick={onNext}>Next: Compile Package <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  );
};
