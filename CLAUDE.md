@AGENTS.md

# Project Rules: Voice AI Prompt Autobuilder
- **Architecture:** Next.js App Router, React, TypeScript, Tailwind CSS.
- **Database:** Prisma ORM (lib/db.ts). Always run `npx prisma format` and `npx prisma generate` after modifying schema.prisma.
- **Core Logic:** Compiler pipeline (lib/compiler/), LLM adapters (lib/llm/), Testing harness (lib/testing/).
- **Context:** Always check MEMORY.md before starting a new workflow.

# Behavioral Guidelines
1. **Think Before Coding:** State assumptions explicitly. Present multiple interpretations and do not pick silently when ambiguity exists. Push back if a simpler approach exists, and stop when confused.
2. **Simplicity First:** Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, and no unrequested flexibility. If 200 lines could be 50, rewrite it.
3. **Surgical Changes:** Touch only what you must. Match existing style. Do not improve adjacent code, comments, or formatting. Do not refactor unbroken things.
4. **Goal-Driven Execution:** Define verifiable success criteria. Transform imperative tasks into verifiable goals (e.g., write a test, then make it pass).
