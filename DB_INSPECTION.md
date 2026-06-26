# Inspecting the Local SQLite Database

This application strictly adheres to a local SQLite storage architecture (`prisma/dev.db`) managed via Prisma ORM v6.4.0. No PostgreSQL, MySQL, or cloud Supabase instances are required.

## Option 1: DB Browser for SQLite (Recommended Desktop Graphical Tool)

1. Download and install **DB Browser for SQLite** from [sqlitebrowser.org](https://sqlitebrowser.org/).
2. Launch the application and click **Open Database**.
3. Navigate to your project repository folder and select:
   `prisma/dev.db`
4. Switch to the **Browse Data** tab.
5. Select any table from the dropdown:
   - `PromptProject`: Contains compiled Agent Blueprints, System Prompts, quality radar scores (0-100), and version counters.
   - `DynamicVariable`: Stores runtime token injections (e.g., `{{caller_name}}`).
   - `SuggestedFunction`: Holds tool specification schemas (e.g., `check_availability`).
   - `KnowledgeNote`: Contains exact speakable FAQ wording cards.
   - `TestScenario`: Holds multi-persona benchmark prompts (`angry caller`, `price-sensitive caller`).
   - `PromptVersion`: Stores incremental audit snapshots when users revert or publish packages.
   - `BuilderSession`: Tracks active wizard stepper state.

## Option 2: Prisma Studio (Web-Based Inspection)

Run the following command in your terminal from the workspace root:

```bash
npx prisma studio
```

This will automatically boot a local graphical explorer at `http://localhost:5555` where you can view, edit, search, and delete records directly in your browser.

## Database File Path Source of Truth

The database file resides at:
`c:\Users\Aayush\Desktop\AutoPrompt\prisma\dev.db`
