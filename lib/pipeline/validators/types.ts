export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  score?: number;
}

export interface FsmValidationResult extends ValidationResult {
  unreachableStates?: string[];
  missingTeardowns?: string[];
  orphanedTools?: string[];
}
