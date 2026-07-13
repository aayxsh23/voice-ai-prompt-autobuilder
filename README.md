# Voice Agent Prompt Builder

A full-stack app that compiles a short discovery conversation into a **production-ready system prompt** for an AI telephony voice agent (English / Hindi / Hinglish). It generates the prompt package — it does **not** place calls or run STT/TTS. Export the output into your telephony runner (Bland, Retell, Vapi, or generic).

## Stack

- **Next.js 16** (App Router, Route Handlers) + **React 19**
- **MongoDB** via **Prisma 6**
- **Qwen** LLM through an **OpenAI-compatible** endpoint (vLLM / Ollama / hosted)
- **Tailwind 4**, `react-hook-form` + `zod`
- **Vitest** for tests

## How it works

```
Builder chat ──► /api/builder/chat ──► CoverageArchitect (discovery gap checks)
                                          │  extracts a BusinessSpecification patch (LLM)
                                          ▼
          /api/builder/generate-review ──► compilePromptPackage()   [lib/pipeline/promptCompiler.ts]
                 1. WorkflowArchitect  → call-flow state machine   (LLM)
                 2. KnowledgeArchitect → FAQs / objections         (LLM)
                 3. ToolPlanner        → tool schemas              (LLM)
                 4. QwenProvider.generateWithCoT → structured draft (LLM)
                 5. filterRelevantRules → default guardrail rules   (DB)
                 6. assembleUnifiedPrompt → deterministic markdown assembly
                 7. validators → variable / fallback / coherence / flow checks
                                          ▼
        /api/builder/create-project ──► MongoDB ──► Studio (/project/[id]): edit, simulate, version, publish
```

## Project layout

```
app/
  api/                     Route handlers (builder/*, projects/*)
  builder/[sessionId]/     Conversational builder UI
  project/[projectId]/     Studio workspace
components/                UI, dashboard, project panels, settings
lib/
  config.ts                Validated runtime config (Qwen endpoint + model)
  db.ts                    Prisma client singleton
  llm/                     Qwen provider, shared types, CallFlowPlan
  compiler/
    blueprint/             Extractors + CoverageArchitect
    planners/              Workflow / Knowledge / Tool architects
    assembler/             PromptAssembler (deterministic prompt builder)
    constants/, adapters/
  pipeline/                promptCompiler orchestrator + validators
  testing/                 MultiDomainTestHarness (compile smoke test)
prisma/                    schema.prisma (MongoDB) + seed.ts (default guardrail rules)
```

## Getting started

Requires **Node 20+** and a running **MongoDB** and **Qwen** (OpenAI-compatible) endpoint.

```bash
npm install
cp .env.example .env      # then fill in the values below
npx prisma generate
npx prisma db push        # sync schema to MongoDB
npm run prisma:seed       # seed default guardrail / speakability rules
npm run dev               # http://localhost:3000
```

### Environment (`.env`)

```env
DATABASE_URL="mongodb://localhost:27017/autoprompt"
QWEN_BASE_URL_FOR_LLM="http://localhost:8000/v1"
QWEN_API_KEY="EMPTY"
QWEN_MODEL="Qwen/Qwen3.6-35B-A3B-FP8"
```

All LLM configuration is read and validated once in [`lib/config.ts`](lib/config.ts).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit). Set `RUN_LLM_TESTS=1` to include the live compile smoke test |
| `npm run prisma:seed` | Seed default rules |
| `npm run db:reset` | Push schema (data loss) + reseed |

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every push and PR.
