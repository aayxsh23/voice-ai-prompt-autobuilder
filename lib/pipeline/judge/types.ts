export type IssueSeverity = 'critical' | 'major' | 'minor';
/** Kept in sync with ContractCategory so contract violations map across losslessly. */
export type IssueCategory =
  | 'language' | 'missing' | 'extra' | 'incorrect'
  | 'coverage' | 'persona' | 'dialogue' | 'tooling' | 'locale';

export interface JudgeIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  description: string;              // e.g. "User asked for Hinglish; dialogue is pure English."
  evidenceFromConversation: string; // e.g. the user turn that set the requirement
  whereInPrompt: string;            // e.g. section/state or "absent"
  suggestedFix: string;             // concrete instruction on how to repair
}

export interface JudgeReport {
  verdict: 'pass' | 'fail';
  score: number;                    // 0–100, severity-weighted
  issues: JudgeIssue[];
  blockingCount: number;            // # of critical issues
  fixedIssues?: JudgeIssue[];       // issues that were auto-fixed during the loop
}
