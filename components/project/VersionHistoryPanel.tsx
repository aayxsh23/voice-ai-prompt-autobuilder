import React from 'react';
import { Card, Badge, Button } from '../ui';
import { Clock, FileDiff } from 'lucide-react';

interface Props {
  versions: any[];
  currentVersion: number;
  onRestore: (ver: any) => Promise<void>;
}

export const VersionHistoryPanel: React.FC<Props> = ({ versions, currentVersion, onRestore }) => {
  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">Version History</h3>
        <p className="text-[11px] text-[#62666d]">Compare prompt evolution and roll back to known stable configurations.</p>
      </div>

      <div className="space-y-2">
        {versions.map((ver) => {
          const isCurr = ver.version === currentVersion;
          return (
            <div
              key={ver.id}
              className={`p-4 rounded-[6px] border flex items-center justify-between text-[12px] transition-colors ${
                isCurr ? "bg-[#161718] border-[#e4f222]/40" : "bg-[#0f1011] border-[#23252a] hover:border-[#323334]"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-medium text-[#f7f8f8] text-[13px]">v{ver.version}</span>
                  {isCurr && <Badge variant="default" className="text-[9px] bg-[#e4f222] text-[#030404] border-[#e4f222]">Active</Badge>}
                </div>
                <p className="text-[#62666d]">{ver.changeSummary || "Snapshot commit."}</p>
                <span className="text-[10px] text-[#62666d] flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3" /> {new Date(ver.createdAt || Date.now()).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {!isCurr && (
                  <Button size="sm" variant="outline" onClick={() => onRestore(ver)} className="h-7 text-[11px]">
                    <FileDiff className="h-3 w-3 mr-1" /> Revert
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
