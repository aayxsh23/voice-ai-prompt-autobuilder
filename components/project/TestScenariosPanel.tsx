import React from 'react';
import { Card, Badge, Button } from '../ui';
import { Play, CheckCircle2 } from 'lucide-react';

interface Props {
  scenarios: any[];
  onSelectPersona?: (persona: string, msg: string) => void;
}

export const TestScenariosPanel: React.FC<Props> = ({ scenarios, onSelectPersona }) => {
  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">QA Test Scenarios</h3>
        <p className="text-[11px] text-[#62666d]">Benchmark your prompt against challenging caller attitudes.</p>
      </div>

      <div className="space-y-3">
        {scenarios.map(s => {
          const isHigh = s.riskLevel === 'high' || s.persona?.includes('angry');
          return (
            <div key={s.id} className="p-4 rounded-[6px] border border-[#23252a] bg-[#0f1011] hover:border-[#323334] transition-colors space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={isHigh ? "warning" : "default"} className="capitalize text-[10px] font-mono">
                      <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isHigh ? 'bg-[#eb5757]' : 'bg-[#62666d]'}`} />
                      {s.persona}
                    </Badge>
                    <span className="text-[10px] uppercase font-mono text-[#62666d]">{s.riskLevel}</span>
                  </div>
                  <h4 className="font-medium text-[13px] text-[#d0d6e0] mt-1">{s.title}</h4>
                </div>
                {onSelectPersona && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSelectPersona(s.persona, s.sampleCallerMessage)}
                    className="text-[11px] h-7"
                  >
                    <Play className="h-3 w-3 mr-1" /> Test
                  </Button>
                )}
              </div>

              <div className="text-[11px] bg-[#161718] p-2.5 rounded-[6px] border border-[#23252a] font-mono text-[#8a8f98]">
                "{s.sampleCallerMessage}"
              </div>

              <div className="text-[11px] text-[#62666d] flex items-start gap-1.5 pt-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#27a644] shrink-0 mt-0.5" />
                <span><strong className="text-[#8a8f98]">Expected:</strong> {s.expectedAgentBehavior}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
