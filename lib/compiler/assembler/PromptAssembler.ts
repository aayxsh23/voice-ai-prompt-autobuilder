// lib/compiler/assembler/PromptAssembler.ts

import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class PromptAssembler {
  assemble(ir: VoiceAgentIR, components: { flow: string; voice: string; tools?: string; safety: string }): string {
    const sessionContextBlock = ir.context && ir.context.length > 0
      ? ir.context.map(c => `- **${c.key}** (${c.label}): ${c.description} [Source: ${c.source}] ${c.defaultValue ? `(Default: ${c.defaultValue})` : ''}`).join("\n")
      : "- No external session context variables pre-loaded. Collect required parameters dynamically.";

    return `
# PRODUCTION directive: VOICE SYSTEM ARCHITECTURE TARGET

## Session Context
${sessionContextBlock}

## IDENTITY & ASSIGNED CONTEXT
- Agent: ${ir.meta?.agentName || "Voice Agent"}
- Company Focus: ${ir.meta?.companyName || "Enterprise Client"}
- Persona Style: ${ir.meta?.role || "Operational Coordinator"} (Operational Pacing: ${ir.meta?.toneProfile?.join(", ") || "Calm, Direct"})
- Language Variant: ${ir.meta?.languageVariant || "English"}

### CORE OPERATIONAL DIRECTIVES (ALWAYS PASSIVE-ACTIVE)
- Never use markdown styling flags inside text blocks.
- Never output multi-question strings inside single interaction turns.
- Distinguish pre-loaded Session Context variables from required slot collection targets. Never re-ask callers for verified CRM session data.

---

${components.flow}

---

${components.voice}

---

${components.tools || ""}

---

${components.safety}
`.trim();
  }
}
