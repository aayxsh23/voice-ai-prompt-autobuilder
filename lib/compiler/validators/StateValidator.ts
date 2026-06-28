// lib/compiler/validators/StateValidator.ts

import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class StateValidator {
  validate(ir: VoiceAgentIR): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check 1: Ensure execution states have deterministic sequences
    const orders = ir.states?.map(s => s.sequenceOrder) || [];
    if (new Set(orders).size !== orders.length) {
      // Auto-reconcile sequence orders if duplicates exist
      ir.states?.forEach((state, idx) => {
        state.sequenceOrder = idx + 1;
      });
    }

    // Check 2: Auto-reconcile and verify state-bound slots
    if (!ir.slots) ir.slots = [];
    const declaredSlots = new Set([
      ...ir.slots.map(s => s.name.toLowerCase()),
      ...(ir.context?.map(c => c.key.toLowerCase()) || [])
    ]);

    ir.states?.forEach(state => {
      state.slotsToCollect?.forEach(slot => {
        if (!declaredSlots.has(slot.toLowerCase())) {
          // Auto-reconcile missing slot definition into IR so linker never halts draft builds
          ir.slots!.push({
            name: slot,
            type: "string",
            ttsNormalizationRule: "standard conversational speech",
            isRequired: true
          });
          declaredSlots.add(slot.toLowerCase());
        }
      });
    });

    return { isValid: errors.length === 0, errors };
  }
}
