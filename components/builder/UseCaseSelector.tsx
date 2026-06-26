import React from 'react';
import { USE_CASE_TEMPLATES } from '@/lib/templates';
import { ArrowRight } from 'lucide-react';

interface UseCaseSelectorProps {
  selectedId: string;
  onSelect: (template: any) => void;
  onNext: () => void;
}

export const UseCaseSelector: React.FC<UseCaseSelectorProps> = ({ selectedId, onSelect, onNext }) => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto py-8">
      <div className="text-center space-y-2">
        <h2 className="text-[20px] font-light text-[#f7f8f8] tracking-[-0.2px]">Choose a Starter Template</h2>
        <p className="text-[#62666d] text-[13px]">Select a pre-configured architecture tailored for specific business call flows.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {USE_CASE_TEMPLATES.map((tmpl) => {
          const isSelected = tmpl.id === selectedId || tmpl.name === selectedId;
          return (
            <div
              key={tmpl.id}
              onClick={() => onSelect(tmpl)}
              className={`p-5 rounded-[12px] border transition-colors cursor-pointer relative flex flex-col justify-between ${
                isSelected
                  ? "border-[#e4f222] bg-[#161718] ring-1 ring-[#e4f222]"
                  : "border-[#23252a] bg-[#161718] hover:border-[#323334]"
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-[2px] bg-[#23252a] text-[#8a8f98]">
                    {tmpl.industry}
                  </span>
                  {isSelected && <span className="h-2 w-2 rounded-full bg-[#e4f222]" />}
                </div>
                <h3 className="font-medium text-[#f7f8f8] text-[14px]">{tmpl.name}</h3>
                <p className="text-[12px] text-[#62666d] leading-relaxed">{tmpl.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#23252a] flex flex-wrap gap-1">
                {tmpl.defaultIntents.slice(0, 2).map((intent) => (
                  <span key={intent} className="text-[10px] bg-[#0f1011] text-[#62666d] px-1.5 py-0.5 rounded-[2px] font-mono">
                    {intent}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          disabled={!selectedId}
          onClick={onNext}
          className="inline-flex items-center px-5 py-2.5 rounded-[6px] bg-[#e4f222] text-[#030404] font-medium text-[13px] hover:bg-[#d4e220] disabled:opacity-50 cursor-pointer transition-colors"
        >
          Next: Business Snapshot
          <ArrowRight className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
