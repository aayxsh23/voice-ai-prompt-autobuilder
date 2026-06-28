// lib/compiler/validators/StateValidator.ts

import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class StateValidator {
  validate(ir: VoiceAgentIR): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check 1: Ensure execution states have deterministic sequences
    const orders = ir.states?.map(s => s.sequenceOrder) || [];
    if (new Set(orders).size !== orders.length) {
      errors.push("Compilation Error: Multiple conversational states share identical sequence priority positions.");
    }

    // Check 2: Verify every state-bound slot is explicitly declared in slots or hydrated session context
    const declaredSlots = [
      ...(ir.slots?.map(s => s.name) || []),
      ...(ir.context?.map(c => c.key) || [])
    ];

    ir.states?.forEach(state => {
      state.slotsToCollect?.forEach(slot => {
        if (!declaredSlots.includes(slot)) {
          errors.push(`Compilation Linker Error: State '${state.stateName}' references missing data slot or session context identifier: '${slot}'`);
        }
      });
    });

    return { isValid: errors.length === 0, errors };
  }
}
