import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../ui';

interface BuilderStepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

const STEPS = [
  "Use Case",
  "Snapshot",
  "Mission",
  "Conversation",
  "Personality",
  "Readiness",
  "Review",
  "Create"
];

export const BuilderStepper: React.FC<BuilderStepperProps> = ({ currentStep, onStepClick }) => {
  return (
    <div className="w-full bg-[#0f1011] border-b border-[#23252a] px-6 py-3.5 overflow-x-auto">
      <div className="flex items-center justify-between min-w-[600px] max-w-5xl mx-auto">
        {STEPS.map((stepName, idx) => {
          const stepNum = idx + 1;
          const isDone = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <div key={stepName} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => onStepClick && isDone && onStepClick(stepNum)}
                disabled={!isDone && !isCurrent}
                className={cn(
                  "flex items-center space-x-2 text-left focus:outline-none transition-opacity",
                  !isDone && !isCurrent && "opacity-40 cursor-not-allowed"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-mono font-medium transition-colors",
                    isDone && "bg-[#e4f222] text-[#030404]",
                    isCurrent && "border border-[#e4f222] text-[#e4f222]",
                    !isDone && !isCurrent && "border border-[#23252a] bg-[#161718] text-[#62666d]"
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : stepNum}
                </div>
                <span
                  className={cn(
                    "text-[12px] hidden md:inline-block whitespace-nowrap",
                    isCurrent ? "text-[#f7f8f8] font-medium" : isDone ? "text-[#8a8f98]" : "text-[#62666d]"
                  )}
                >
                  {stepName}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={cn("h-px w-full mx-2", isDone ? "bg-[#e4f222]" : "bg-[#23252a]")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
