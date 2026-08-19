# Life App — Foundation + Dashboard — Design Spec

- **Date:** 2026-08-19
- **Status:** Draft for review
- **Scope of this spec:** Sub-project 1 of 3 — the shared foundation plus the Life Dashboard tab.
  The Tree-of-Thought and Money Planner tabs are deliberately out of scope here and get
  their own spec → plan → implementation cycles later.

---

## 1. Overview

A personal, local-first "Life app" that consolidates the owner's calendar, email-derived
tasks, finances, health data, and reminders into a single dashboard. Data is pulled from
external sources on a routine schedule by an agentic Claude Code plugin, written to a
structured store, and read back by a local Next.js web app.

This is a single-user tool run on the owner's own machine, distributed to others as a
**fork-and-run** open-source project (each user runs their own copy against their own
accounts and data). A desktop app and a phone-accessible interface are explicitly future
work, kept open by the architecture but not built here.

## 2. Goals / Non-goals

### Goals
- One screen consolidating: today's agenda, tasks, finances (current + goals), health, reminders.
- Data ingested automatically on a ~6-hour schedule, plus on-demand refresh.
- Zero marginal cost: no metered API usage; the AI engine runs on the owner's Claude Max
  subscription via Claude Code.
- Easy to extend with new data sources ("add a skill").
- Reliable enough to trust financial and health numbers.
- Built so that (a) a phone interface and (b) a desktop app can be added later without a rewrite.

### Non-goals (this sub-project)
- The Tree-of-Thought tab and the Money Planner tab.
- Multi-user / hosted SaaS operation (fork-and-run means every user is single-user on their own machine).
- A native mobile app (deferred; see §11).
- Real-time data (6h cron + manual refresh is sufficient).
- Auth UI (single hardcoded local user in v1).

## 3. Constraints & key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary UI framework | **Next.js (App Router) + TypeScript**, run locally | Needs a server (filesystem + secrets + AI calls) alongside a rich React UI in one process. |
| Human-authored store | **Obsidian vault** (existing, iCloud-synced: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Utilities`) | Great for freeform notes/goals/ideas; already in daily use. |
| Structured/ingested store | **Supabase (Postgres)** | Time-series + analytical queries (finance, health) that Markdown can't serve; clean read API for web and any future phone client. |
| AI engine | **Claude Code**, driven headlessly (Agent SDK / `claude -p`), authenticated by the owner's **Claude Max** subscription | Free on Max (first-party, supported use); good at reading files and running tools. **Not** the metered Messages API. |
| Ingestion style | **Agentic (Claude Code plugin)** for fetch + normalize; **deterministic code** for the DB write | Flexibility where it helps (messy sources), determinism where it must be exact. |
| Distribution | **Fork-and-run** open-source repo; desktop app later | Sidesteps multi-tenancy and data-custody entirely; each user owns their data. |
| Data-access abstraction | UI reads via a `lib/data/` layer, never touches Supabase/vault/MCP directly | Keeps the phone/desktop/store-swap doors open cheaply. |

**Rejected / noted alternatives:**
- **Metered Anthropic API** — rejected; owner requires $0 marginal cost. Claude Max does not
  cover third-party API usage, but *does* cover Claude Code, which is the engine here.
- **Git-backed data feed** (instead of Supabase) — rejected for structured data; not queryable
  for time-series/charts.
- **OpenClaw as the agent engine** — noted as an *optional future orchestration/interface layer*
  (always-on daemon, cross-conversation memory, messaging front-end). Not adopted now: its
  supported Claude path requires a paid API key, so it does not provide "a free agent" — the
  free-ness comes from Claude Code underneath, which is already the engine. If adopted later,
  it would wrap Claude Code for its *features*, not for cost.
- **In-process ingestion inside Next.js** — rejected in favor of a separate plugin entry point
  to keep the read and write paths cleanly separated (CQRS-style).

## 4. Architecture

```
SOURCES:  Google Calendar · Gmail (via MCP connectors)
          Apple Health · Fidelity (via export/shortcut — later; no clean API)
              │ pull + normalize (agentic)
              ▼
① life-ingest  (Claude Code plugin)
   • one skill per source; runs headless on a schedule (launchd → claude -p "/ingest")
   • AGENT fetches + normalizes → hands a VALIDATED payload to a deterministic writer
   • writer (plain TS) is the ONLY thing that touches the DB
              │ strict-schema, idempotent upsert
              ▼
② Stores:  Supabase (structured/time-series)   +   Obsidian vault (human notes + AI summaries)
              │ read (never writes external sources)
              ▼
③ life-app  (Next.js, App Router, local)
   • Dashboard reads Supabase + vault via lib/data/
   • calls the ai-engine module for reasoning (daily briefing; later tabs)
   • "Refresh now" button triggers ① on demand

④ ai-engine  — shared module wrapping Claude Code (Agent SDK / headless, Max-plan auth).
              Used by BOTH ① (optional ingest summarization) and ③ (reasoning).
```

**Load-bearing boundaries:**
1. **Deterministic write path** — the agent normalizes; a schema-validating writer performs the upsert. The only DB-touching code is small and testable.
2. **`lib/data/` read seam** — UI calls `getTasks(userId)` etc., unaware of the backing store.
3. **Single `ai-engine` wrapper** — one mockable entry point to the Claude Code engine, shared by ingestor and app.

Everything runs locally on the owner's Mac (`npm run dev` + a `launchd` job). Supabase (free tier) is the only hosted component.

## 5. Data model

### Store split
- **Supabase:** machine-ingested, structured, time-series data — agenda, tasks, finance, health, ingest logs. Rule: *if the agent writes it and a chart reads it → DB.*
- **Obsidian:** human-authored — goals, ideas, tree-of-thought, typed reminders, plus optional AI summary notes. Rule: *if the owner types it → vault.*

### Supabase schema (v1)
Every table has `id uuid primary key default gen_random_uuid()`, `user_id uuid not null`,
`created_at timestamptz not null default now()`. All timestamps are `timestamptz`. Raw source
payloads are retained as `jsonb` for auditability.

`user_id` is a fixed local constant in v1 but present from day one (cheap future-proofing). **v1
has no Supabase Auth**, so user scoping is enforced in application code: every `lib/data/` query
and every `write.ts` upsert filters/sets `user_id` explicitly. **RLS is enabled on all tables**
as a safety net, but with a no-op-by-default posture in v1 (there is no `auth.uid()` to key a
policy on, and a local key would bypass it regardless); full RLS-with-auth policies land only if
this ever grows to real multi-user (which fork-and-run makes unlikely). The point of keeping
`user_id` now is that it costs nothing and keeps that door open.

```
calendar_events   -- today/upcoming agenda
  source text, external_id text, title text, starts_at timestamptz, ends_at timestamptz,
  location text, raw jsonb
  UNIQUE (user_id, source, external_id)                 -- idempotent upsert key

tasks             -- actionable to-dos extracted from calendar + email
  source text ('gcal'|'gmail'|'manual'), external_id text, title text,
  due_at timestamptz, done boolean not null default false, raw jsonb
  UNIQUE (user_id, source, external_id)
  INDEX (user_id, done, due_at)                         -- main dashboard query

health_metrics    -- narrow time-series across metric types
  metric_type text ('steps'|'weight'|'sleep_hours'|'resting_hr'|…),
  value numeric, unit text, recorded_at timestamptz, source text
  UNIQUE (user_id, metric_type, recorded_at, source)
  INDEX (user_id, metric_type, recorded_at desc)        -- "metric over time"

finance_accounts  -- latest balance snapshot per account
  account_id text, name text, kind text ('checking'|'brokerage'|…),
  balance numeric, currency text, as_of timestamptz
  UNIQUE (user_id, account_id)

finance_goals     -- the "goals" half of the finance requirement
  name text, target_amount numeric, current_amount numeric, target_date date

ingest_runs       -- observability; one row per source per run
  source text, started_at timestamptz, finished_at timestamptz,
  status text ('ok'|'partial'|'error'), rows_written int, error text
```

**Notes:**
- `health_metrics` is deliberately narrow (one row per metric-per-timestamp) so new metrics are new rows, not migrations.
- Idempotency is structural: every ingested table has a UNIQUE natural key; the writer upserts `ON CONFLICT`.
- `ingest_runs` is the trust mechanism for an agentic ingestor — makes "did the sync work?" a query.
- Reminders live in the vault; the dashboard reads them from there (no reminders table in v1).

## 6. The `life-ingest` plugin (write path)

Claude Code plugin, run headless on a schedule.

```
life-ingest/
├── commands/ingest.md          → /ingest [source]         (entry point)
├── skills/
│   ├── ingest-calendar/        HOW to fetch + normalize (target JSON shape)
│   ├── ingest-gmail/
│   ├── ingest-health/          (later)
│   └── ingest-finance/         (later)
├── .mcp.json                   declares Gmail / Google Calendar MCP servers
└── scripts/write.ts            the deterministic writer
```

**Flow per source:**
1. **Agent** (Claude Code + MCP): fetch raw data from the source.
2. **Agent** (guided by the source skill): normalize into the defined JSON shape.
3. **Agent** calls the writer: `write.ts --source <name>` with the normalized payload.
   — determinism boundary —
4. **`write.ts`** (plain code): validate payload with **zod** against the schema →
   upsert to Supabase `ON CONFLICT` → write an `ingest_runs` row (`ok`/`partial`/`error`).
5. **Agent** (optional): write a human-readable summary note to the vault.

The agent never writes SQL. A malformed payload is rejected by `write.ts` (non-zero exit,
error surfaced to the agent); nothing reaches the DB.

**Extensibility:** a new source = a new `skills/ingest-<source>/SKILL.md` + a zod schema/branch
in `write.ts`. No pipeline rewiring.

**Scheduling & on-demand:**
- Routine: a macOS `launchd` job every ~6h runs `claude -p "/ingest"` headless (Max-plan auth).
- On-demand: the dashboard "Refresh now" button runs the same command via a Next.js Server Action.

**Reliability properties:** idempotent (unique keys + upsert), isolated failures (sources ingest
independently), auditable (`ingest_runs`).

## 7. The dashboard (read path)

```
Next.js Server Components → lib/data/ → supabase-js (read) + gray-matter (vault read)

lib/data/:
  getAgenda(userId)                 → calendar_events (today/upcoming)
  getTasks(userId)                  → tasks (open, by due date)
  getFinance(userId)                → finance_accounts + finance_goals
  getHealthSeries(userId, metric, range) → health_metrics
  getReminders(userId)              → Obsidian vault (frontmatter/notes)
  getLastSync()                     → ingest_runs (freshness indicator)
```

The UI calls `lib/data/` functions and never knows the backing store — the seam that keeps
phone/desktop/store-swap cheap.

**Dashboard page — one screen of widget cards:**
- Header: greeting + "last synced N ago" (`getLastSync`)
- Today's agenda (`getAgenda`) · Tasks (`getTasks`)
- Finance: balances + goals (`getFinance`, Recharts)
- Health: sparklines for weight/steps/sleep (`getHealthSeries`, Recharts)
- Reminders (`getReminders`, from vault)
- ✨ Daily briefing (AI) + **[Refresh]**

Charts are Recharts client components; everything else renders server-side.

**AI via the `ai-engine` module:**
- **Daily briefing:** a Server Action gathers the day's data via `lib/data/`, hands it to
  `ai-engine.summarize(context)` (→ Claude Code on Max), renders a short natural-language summary.
  Cached so it isn't regenerated on every load.
- Later tabs (tree-of-thought, money planner) plug into the same module.

**Write triggers stay out of the read path:** "Refresh now" is a Server Action that shells out
to `/ingest`, then `revalidatePath()` re-reads. Reading and ingesting stay separated.

**Local specifics:** `npm run dev`; Supabase client reads with local env keys; single hardcoded `userId`; no auth UI.

## 8. Error handling & failure modes

| Failure | Behavior | Why safe |
|---|---|---|
| Source unreachable | That source logs `status: error` in `ingest_runs`; others proceed | Sources ingest independently |
| Agent produces malformed payload | `write.ts` zod-rejects, non-zero exit, nothing written | Determinism boundary |
| Cron + Refresh fire close together | Second run upserts same rows | Unique keys + `ON CONFLICT` |
| Agent hallucinates a valid-shaped value | Flagged, not prevented (see limitation) | — |
| Supabase unreachable at read | Dashboard shows last-known + a visible error state | Read path degrades, not crashes |
| Briefing call fails/slow | Briefing widget shows "unavailable, retry" | AI is one widget, not the page |

**Honest limitation:** the writer guarantees *well-formed + idempotent* data, not correct
*interpretation*. A hallucinated-but-schema-valid number can slip through. Mitigations: tight,
example-driven normalization skills; near-verbatim extraction for finance; `raw jsonb` retained
for auditing; spot-check early finance runs.

**Freshness is first-class:** the dashboard always shows "last synced," so a silently-stopped
cron is visible rather than mistaken for current data.

## 9. Testing strategy

- **`write.ts` (critical) — real unit tests:** zod accept/reject on good/malformed payloads;
  upsert idempotency (write twice → one row); `ingest_runs` logging for ok/partial/error. TDD.
- **`lib/data/` — unit tests** against a seeded test schema: each `get*` returns the right shape;
  vault parsing handles messy/empty notes. TDD.
- **Schema — a migration + seed fixture** so tests and the first dashboard render run against known data.
- **Plugin/agent — not unit-tested;** validated by manual dry-run (`/ingest calendar` against the
  real calendar, inspect rows). The schema guard is the safety net.
- **End-to-end smoke:** calendar ingest → confirm `calendar_events` + `ingest_runs` rows → load
  dashboard → agenda widget renders.

## 10. Build order (walking skeleton)

Prove the entire vertical for **one source (Google Calendar)** before fanning out:
1. Supabase schema + migration + seed fixture (`calendar_events`, `ingest_runs`, and the rest).
2. `write.ts` with the calendar zod schema + upsert + `ingest_runs` logging (test-first).
3. `life-ingest` plugin: `commands/ingest.md` + `skills/ingest-calendar` + `.mcp.json` (GCal).
4. `lib/data/` `getAgenda` + `getLastSync` (test-first).
5. Next.js dashboard shell + agenda widget + "last synced" line + Refresh button.
6. `ai-engine` wrapper + the daily-briefing widget.
7. End-to-end smoke check.

Then fan out: Gmail (tasks) → the hard sources (Apple Health export, Fidelity export).

## 11. Future work (kept open, not built here)
- **Tree-of-Thought tab** (React Flow graph + agentic recommendations) — own spec.
- **Money Planner tab** (structured-output budgeting + weekly grocery list) — own spec.
- **Phone access** — read Supabase from an Expo app, and/or an **OpenClaw** messaging front-end
  driving Claude Code on the Mac. The `lib/data/` + `ai-engine` seams are what make this cheap.
- **Desktop app** — wrap the Next.js app with Tauri/Electron (bundle the Next server as a sidecar).
- **Apple Health / Fidelity ingestion** — export/shortcut-based; no clean API for either.

## 12. Open questions
- Exact `launchd` invocation for headless plugin-command execution (`claude -p "/ingest"` shape) —
  confirm during implementation.
- How the agent passes the normalized payload to `write.ts` (stdin vs temp file vs argument) —
  settle in the plan; leaning stdin/temp-file for large payloads.
- Reminder representation in the vault (frontmatter convention vs a dedicated note) — settle when
  building `getReminders`.
