# Voice Agent Prompt Builder & Studio

An enterprise-grade full-stack web application engineered to **architect, compile, audit, improve, benchmark, simulate, and version-control** human-grade prompt packages for AI telephony voice agents.

---

## 🚫 Critical Product Scope Notice

**This is NOT a telephony calling orchestration platform.** 

- **No live telecom integration**: Does not connect directly to Twilio, Vapi, Retell, Bland AI, LiveKit, Plivo, or Telnyx VoIP SIP trunks.
- **No phone number purchasing**: Does not search, buy, or route PSTN/DID phone numbers.
- **No live audio streaming**: Does not run real-time WebRTC audio streaming, Speech-to-Text (STT), or Text-to-Speech (TTS) inference pipelines.

### What This Product Does
**This platform builds production-ready Prompt Packages.** Its sole mandate is to eliminate prompt engineering guesswork by generating high-reliability conversational intelligence bundles ready to be exported into your downstream telephony orchestration layer:
*   **Agent Blueprint (`agent_prompt.md`)**: Exhaustive system instructions with strict slot collection sequences, objection handling rubrics, and verbal readback rules.
*   **System Prompt (`system_prompt.md`)**: High-level behavioral guardrails and persona framing.
*   **Dynamic Runtime Variables**: Injection token definitions (`{{caller_name}}`, `{{account_balance}}`) mapped to CRM payloads.
*   **Suggested Tool Schemas**: Verbal function specifications (`lookup_booking()`, `transfer_specialist()`).
*   **Knowledge Base & FAQ Wording Cards**: Exact speakable answers anchored to company policies.
*   **Stress-Test Scenarios**: Automated QA benchmarks against challenging caller attitudes.

---

## 🎨 Design Philosophy — Linear Midnight Command Deck

The user interface follows a strict **Linear-inspired instrument panel aesthetic** engineered for high data density and zero cognitive noise:
*   **Obsidian Canvas**: Ultra-dark monochrome foundation (`#08090a` canvas background, `#0f1011` nav/toolbars, `#161718` elevated cards).
*   **Rationed Accent**: No decorative gradients. A singular vibrant **Acid Lime (`#e4f222`)** accent is rationed to exactly one primary action or active indicator per screen.
*   **Engineering-Native Typography**: **Inter Variable** for compact UI controls and table density; **JetBrains Mono** for code editors, variable tokens, identifiers, and JSON schemas.
*   **Quiet Surfaces**: Micro-animations are strictly functional. Loading states use static status readouts instead of distracting spinners.

---

## 🏗️ Core Architecture & Workflow

The application operates as a multi-stage compilation pipeline:

```text
┌────────────────────────┐      ┌─────────────────────────┐      ┌────────────────────────┐
│ 1. 15 Starter Schemas  │ ───> │ 2. 7-Step Builder Wizard│ ───> │ 3. Automated Gap Audit │
│    (Medical, SaaS, etc)│      │    (Mission, Tone, Rules)│      │    (Safety & Logic Scan)│
└────────────────────────┘      └─────────────────────────┘      └────────────────────────┘
                                                                             │
                                                                             ▼
┌────────────────────────┐      ┌─────────────────────────┐      ┌────────────────────────┐
│ 6. Studio Workspace    │ <─── │ 5. Self-Critique Loop   │ <─── │ 4. Blueprint Draft Gen │
│    (Simulate, KB, Radar│      │    (LLM Refinement Pass)│      │    (Markdown Assembly)  │
└────────────────────────┘      └─────────────────────────┘      └────────────────────────┘
```

1.  **Template Selection**: Start from 15 pre-configured industry templates (Healthcare Receptionist, Real Estate Lead Qual, Restaurant Reservation, SaaS Demo Booker, Automotive Service Advisor, Insurance Claims, etc.).
2.  **Interactive Wizard**: Walk through 7 focused design steps defining Business Snapshot, Call Mission, Conversation Flow, Voice Personality, and Readback Rules.
3.  **Automated Gap Audit**: The engine scans your draft for acute operational vulnerabilities (e.g. missing business hours, undefined emergency transfer numbers, lack of explicit confirmation readbacks).
4.  **Self-Critique Improvement Loop**: The AI compiler reviews the draft against telephony acoustic constraints and autonomously rewrites complex sentences into clean, speakable phrasing.
5.  **Project Studio**: A dual-pane workspace where prompt engineers fine-tune markdown files, run live voice-turn chat simulations, inspect multi-dimensional quality scores, and manage Git-like version history.

---

## 📊 Quality Radar & Performance Metrics (Calculation Methodology)

Every prompt package is evaluated across **10 production readiness metrics** (scored 0–100%). These metrics are calculated via deterministic rule-based heuristic audits combined with semantic LLM inspection passes:

### 1. Overall Quality Score (Weighted Composite)
An aggregate score aggregating all sub-metrics. A prompt package scoring `< 85%` is flagged with yellow warnings; `< 70%` triggers severe red alerts preventing production deployment.

### 2. Safety Score (Weight: 20%)
*   **How it is calculated**: Scans for mandatory guardrails including explicit AI identity disclosure rules (*"I am an AI assistant on a recorded line"*), strict PII redaction rules (SSN/credit card verbal masking), and acute medical/legal emergency halts (*"If caller reports severe bleeding or chest pain, instruct to hang up and dial 911 immediately"*).

### 3. Hallucination Resistance Score (Weight: 15%)
*   **How it is calculated**: Audits prompt instructions for explicit null-fallback rules. Verifies that the prompt instructs the agent to say *"I don't have that information in my system, let me have a specialist verify that"* rather than guessing unknown dates, pricing tiers, or inventory availability.

### 4. Edge Case Readiness Score (Weight: 15%)
*   **How it is calculated**: Checks whether the prompt defines explicit behavioral branches for hostile or difficult acoustic conditions:
    *   `angry caller`: Mandatory de-escalation tone and expedited human handoff.
    *   `indistinct speech / background noise`: Phrasing to gracefully ask the caller to repeat.
    *   `price-sensitive caller`: Rules to pivot to value propositions or payment plans.

### 5. Voice Style & Cadence Score (Weight: 15%)
*   **How it is calculated**: Evaluates acoustic compatibility for TTS engines:
    *   **No Markdown in Speech**: Deducts points if prompt phrasing contains bullet points, bolding asterisks, or numbered lists that TTS synthetics vocalize awkwardly.
    *   **One Question per Turn Rule**: Flags compound inquiries (*"What is your name and what day works best for you?"*) which cause caller confusion and STT clipping.
    *   **Sentence Length**: Penalizes run-on sentences exceeding 25 words.

### 6. Structure & Slot Sequence Score (Weight: 15%)
*   **How it is calculated**: Validates deterministic state progression. Ensures required data parameters (`name`, `phone`, `appointment_date`) are collected in a logical step-by-step sequence rather than arbitrary jumps.

### 7. Minimum Manual Edit Score (Weight: 10%)
*   **How it is calculated**: A human-grade efficiency metric estimating how close the generated prompt is to zero-touch production readiness. Calculated by checking completeness of placeholder tokens against supplied business parameters.

### 8. Completion Score (Weight: 10%)
*   **How it is calculated**: Measures whether all mandatory telephony lifecycle phases (Spoken Greeting -> Intent Routing -> Slot Collection -> Readback Verification -> Webhook Action -> Spoken Sign-off) are fully populated.

---

## 🤖 LLM Engine & Provider Switch

The studio is powered by an abstracted LLM service layer (`lib/llm/`) supporting hot-swapping between two engines via `.env`:

### Option A: Google Gemini SDK (`LLM_PROVIDER="gemini"`)
*   **SDK**: Uses the official `@google/genai` Node.js SDK.
*   **Exclusively Gemini 3.1 Flash-Lite**: The application is hardcoded and optimized to use **`gemini-3.1-flash-lite`** (`GEMINI_MODEL="gemini-3.1-flash-lite"`). This model provides ultra-fast structured JSON generation, automated schema repairs, and low-latency self-critique generation.

### Option B: Deterministic Mock Provider (`LLM_PROVIDER="mock"`)
*   **Offline Fidelity**: If no API key is provided, the studio automatically switches to a deterministic Mock Provider. It generates realistic, production-grade conversational designs and blueprint markdowns using local rule-based templates, allowing full UI/UX testing without API quota usage.

---

## 🚀 Getting Started Locally (Exhaustive Guide)

### Prerequisites
*   **Node.js**: v18.17.0 or higher (v20+ recommended).
*   **Operating System**: Windows (PowerShell), macOS, or Linux.

### Step 1: Clone & Install Dependencies

```powershell
git clone https://github.com/your-username/voice-agent-prompt-builder.git
cd voice-agent-prompt-builder
npm install
```

### Step 2: Configure Environment Variables

Create your local environment file by copying the template:

```powershell
cp .env.example .env
```

Open `.env` in any text editor and verify the following required fields:

```env
# 1. Local SQLite Database
DATABASE_URL="file:./dev.db"

# 2. Provider Switch ('gemini' or 'mock')
LLM_PROVIDER="gemini"

# 3. Gemini API Key (Get one from https://aistudio.google.com/)
GEMINI_API_KEY="AIzaSy...your_api_key_here..."

# 4. Mandatory API Model Identifier
GEMINI_MODEL="gemini-3.1-flash-lite"
```

> [!IMPORTANT]
> **Windows PowerShell Execution Policy Note**: If you encounter a red `PSSecurityException` error running `npx` or `npm` commands on Windows stating that *running scripts is disabled on this system*, run tools using explicit `.cmd` executables (e.g. `npx.cmd prisma db push` or `npm.cmd run dev`), or bypass the policy for your terminal session:
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

### Step 3: Initialize & Seed SQLite Database

Sync the Prisma ORM schema to create your local `dev.db` SQLite file, then populate it with demo projects (Healthcare Clinic, Real Estate Lead Qual, Restaurant Reservation, SaaS Demo Booker):

```powershell
npx.cmd prisma db push
npm.cmd run prisma:seed
```

### Step 4: Launch Development Server

```powershell
npm.cmd run dev
```

The Turbopack compiler will start in `< 500ms`. Open your web browser and navigate to:
**`http://localhost:3000`**

---

## 📂 Exhaustive Codebase & File Map

```text
├── app/
│   ├── layout.tsx                 # Global shell, Google font injection (Inter + JetBrains Mono)
│   ├── globals.css                # Linear dark color palette variables & base typography
│   ├── page.tsx                   # Obsidian landing page hero with CTA to studio
│   ├── dashboard/page.tsx         # Projects hub displaying saved workspace cards
│   ├── builder/                   # Wizard root view
│   │   ├── page.tsx               # Session creation loader
│   │   └── [sessionId]/page.tsx   # 7-step builder layout container
│   ├── project/[projectId]/page.tsx # Main Studio Workspace split view
│   └── api/                       # Next.js Server REST Route Handlers
│       ├── builder/               # Wizard session endpoints (create, audit, review draft)
│       └── projects/              # Studio CRUD endpoints (simulate turns, evaluate radar, publish)
├── components/
│   ├── ui/index.tsx               # Design system primitives (Button, Input, Textarea, Card, Badge)
│   ├── layout/Navbar.tsx          # Minimal top header bar
│   ├── dashboard/                 # Dashboard project cards
│   ├── builder/                   # Wizard step components
│   │   ├── BuilderStepper.tsx     # Top numbered navigation progress bar
│   │   ├── UseCaseSelector.tsx    # Step 1: Industry starter template picker
│   │   ├── BusinessSnapshotForm   # Step 2: Company name, website, operating hours
│   │   ├── CallMissionForm        # Step 3: Primary telephony mission & supported intents
│   │   ├── ConversationDesign     # Step 4: Intent routing table & readback rules
│   │   ├── PersonalityDesigner    # Step 5: Vocal tone, speaking pace, empathy settings
│   │   ├── GapQuestionsForm       # Step 6: Automated vulnerability audit cards
│   │   └── ReviewDraftPanel       # Step 7: Dual markdown code viewer & compile CTA
│   ├── project/                   # Studio Workspace panels
│   │   ├── PromptSettingsSidebar  # Left navigation bar & publish toggle
│   │   ├── AgentPromptEditor      # Code editor for agent_prompt.md
│   │   ├── SystemPromptEditor     # Code editor for system_prompt.md
│   │   ├── QualityScoreCard       # Multi-dimensional Quality Radar metrics breakdown
│   │   ├── TestPromptSimulator    # Live interactive voice-turn text simulator
│   │   ├── DynamicVariablesTable  # Runtime token manager table
│   │   ├── SuggestedFunctions     # Tool verbalization specifications
│   │   ├── KnowledgeBaseNotes     # FAQ wording card manager
│   │   ├── TestScenariosPanel     # Automated stress-test persona list
│   │   └── VersionHistoryPanel    # One-click rollback snapshot list
│   └── settings/                  # Studio sub-panels (VoiceStyle, Rules, Guardrails, Webhook)
├── lib/
│   ├── llm/                       # GenAI Service Abstraction
│   │   ├── geminiProvider.ts      # Google GenAI SDK integration (gemini-3.1-flash-lite)
│   │   ├── mockLlmProvider.ts     # Local deterministic generator fallback
│   │   └── types.ts               # Shared TypeScript schemas & interfaces
│   ├── pipeline/                  # Business logic engines (Auditor, Compiler, Evaluator)
│   └── templates/                 # 15 Industry Starter JSON blueprints
└── prisma/
    ├── schema.prisma              # Prisma SQLite Database Models (PromptProject, Version, etc)
    └── seed.ts                    # Demo database seeder script
```

---

## 🛡️ Telephony Engineering Best Practices Enforced

When exporting blueprints from this studio into Voice AI runners (Vapi, Bland, Retell), your compiled instructions adhere to best-in-class acoustic engineering rubrics:
1.  **Acoustic Punctuation**: Punctuation is tailored to guide natural speech synthesis pauses (commas for micro-breaths, periods for full stops).
2.  **No Bulleted Utterances**: Lists are transformed into conversational prose (*"We offer three packages: Basic, Pro, and Enterprise"*).
3.  **Strict Readback Gates**: Write operations (`create_appointment`, `process_refund`) are wrapped in explicit confirmation checks (*"Just to make sure I have this right, I'm booking you for Tuesday at 3 PM. Does that sound good?"*).
4.  **Graceful Disconnects**: Standardizes closing lines (*"Thanks for calling. Have a great day! Goodbye."*) to ensure clean telecom line termination.
