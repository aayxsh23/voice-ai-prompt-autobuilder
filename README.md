# Voice Agent Prompt Builder

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

**An intelligent builder that transforms discovery conversations into production-ready system prompts for AI telephony agents.**

## The Why

Building system prompts for voice AI agents (like Bland, Retell, Vapi) is a complex, trial-and-error process. Getting the right mix of call flows, knowledge constraints, and tools often takes hours of manual tweaking. **Voice Agent Prompt Builder** solves this by leveraging an LLM to automate the prompt engineering process. Through a short, guided discovery conversation, it extracts your business needs and deterministically compiles a robust, production-ready system prompt package—saving you hours of manual work and ensuring high-quality, reliable agent behavior.

## Visuals

> **Agent Builder Demo**
> 
> *Here is where you'll see the conversational builder and prompt generation in action. (Add a GIF or screenshot of your UI here)*
> ![Agent Builder Demo](./public/demo-placeholder.gif)

## Architecture

Here is how the compiler, planners, and validators interact under the hood:

```mermaid
flowchart TD
    A[Builder Chat] -->|/api/builder/chat| B(CoverageArchitect)
    B -->|Extracts BusinessSpecification Patch| C[LLM]
    B --> D{API: /api/builder/generate-review}
    
    subgraph Prompt Compiler [lib/pipeline/promptCompiler.ts]
        D --> E[WorkflowArchitect - Call Flow]
        D --> F[KnowledgeArchitect - FAQs/Objections]
        D --> G[ToolPlanner - Tool Schemas]
        E & F & G --> H[QwenProvider.generateWithCoT - Structured Draft]
        H --> I[Filter Default Guardrail Rules from DB]
        I --> J[Assemble Unified Prompt - Markdown]
        J --> K[Validators - Flow, Fallback, Coherence]
    end
    
    K --> L[API: /api/builder/create-project]
    L --> M[(MongoDB)]
    M --> N[Studio Workspace]
```

## Codebase Organization

Navigating the repository:

- **/app**: Contains the Next.js App Router setup, including API routes (`/api/*`), the builder interface (`/builder/*`), and the studio workspace (`/project/*`).
- **/components**: Houses reusable UI components, dashboard elements, and layout pieces utilized across the application.
- **/lib**: The core engine of the application. Contains database logic (`db.ts`), configuration (`config.ts`), LLM integration (`llm/`), the multi-stage compiler (`compiler/`), and validators (`pipeline/`).

## Stack

- **Next.js 16** (App Router, Route Handlers) + **React 19**
- **MongoDB** via **Prisma 6**
- **Qwen** LLM through an **OpenAI-compatible** endpoint (vLLM / Ollama / hosted)
- **Tailwind 4**, `react-hook-form` + `zod`
- **Vitest** for tests

## Getting Started

### Prerequisites
- **Node 20+**
- Running **MongoDB** instance
- **Qwen** (OpenAI-compatible) endpoint

### Installation & Setup

1. **Clone and Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file based on the example:
   ```bash
   cp .env.example .env
   ```
   Fill in your values:
   ```env
   DATABASE_URL="mongodb://localhost:27017/autoprompt"
   QWEN_BASE_URL_FOR_LLM="http://localhost:8000/v1"
   QWEN_API_KEY="EMPTY"
   QWEN_MODEL="Qwen/Qwen3.6-35B-A3B-FP8"
   # ... add your ATLAS keys if using MongoDB Atlas
   ```

3. **Database Setup**
   Generate Prisma client, push schema, and seed default rules:
   ```bash
   npx prisma generate
   npx prisma db push
   npm run prisma:seed
   ```

4. **Run the Application**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3000` to start using the builder.

### Common Usage Scenario
1. Open the builder (`http://localhost:3000`).
2. Start a conversation to describe your voice agent's purpose (e.g., "I need a customer support agent for my bakery").
3. The system's **CoverageArchitect** will identify gaps and prompt you for more details (like opening hours, FAQs, and booking tools).
4. Once the specification is complete, the compiler generates a ready-to-use markdown prompt that you can export or copy-paste directly into your preferred telephony provider.

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
