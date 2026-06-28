// lib/compiler/validators/ToolValidator.ts

import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class ToolValidator {
  validate(ir: VoiceAgentIR): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const declaredStateIds = ir.states?.map(s => s.stateId) || [];

    ir.tools?.forEach(tool => {
      if (tool.bindingStateId && !declaredStateIds.includes(tool.bindingStateId) && tool.bindingStateId !== "global") {
        errors.push(`Tool Validation Error: Function '${tool.functionName}' is bound to non-existent state ID '${tool.bindingStateId}'`);
      }
    });

    return { isValid: errors.length === 0, errors };
  }
}
