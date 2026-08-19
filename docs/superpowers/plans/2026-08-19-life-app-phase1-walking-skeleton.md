# Life App — Phase 1 (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Next.js dashboard that shows today's Google Calendar agenda, ingested by an agentic Claude Code plugin into Supabase, with a "last synced" indicator, a manual refresh, and an AI daily briefing.

**Architecture:** A Claude Code plugin (`life-ingest`) fetches calendar data via MCP, normalizes it, and hands a validated payload to a deterministic TypeScript writer that upserts to Supabase and logs the run. A Next.js App Router app reads that data through a `lib/data/` seam and renders it; an `ai-engine` module wraps Claude Code (Max-plan auth) for a daily briefing. Everything runs locally.

**Tech Stack:** Next.js (latest, App Router) · TypeScript · Supabase (Postgres) + `@supabase/supabase-js` · `zod` · `recharts` · `gray-matter` · `vitest` · `tsx` · Claude Code (headless, Max subscription) · macOS `launchd`.

**Spec:** `docs/superpowers/specs/2026-08-19-life-app-foundation-dashboard-design.md`

## Global Constraints

- **Zero marginal cost:** the AI engine is Claude Code on the owner's **Claude Max** subscription (headless `claude -p`), never the metered Anthropic API. No `ANTHROPIC_API_KEY` in app code.
- **Determinism boundary:** the ingest agent never writes to Postgres directly. The only DB-writing code is `scripts/write.ts`, which validates every payload with zod before upserting.
- **Idempotency:** every ingested table has a UNIQUE natural key; all writes are `upsert … onConflict`.
- **`user_id` everywhere:** a single fixed local constant `LOCAL_USER_ID` (a UUID) is set on every write and filtered on every read. No Supabase Auth in v1.
- **Read seam:** UI code reads only through `lib/data/`; it never imports the Supabase client or reads the vault directly.
- **Timestamps:** all DB timestamps are `timestamptz`; the app treats them as UTC and formats in local time at render.
- **Secrets:** Supabase URL + keys and the vault path live in `.env.local` (git-ignored); `.env.example` documents them.

---

### Task 1: Scaffold the project

**Files:**
- Create: the repo `life-app` (from template), `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `vitest.config.ts`, `.gitignore` additions
- Create: `app/layout.tsx`, `app/page.tsx` (placeholder), `lib/config.ts`

**Interfaces:**
- Produces: `LOCAL_USER_ID: string` and `getVaultPath(): string` from `lib/config.ts`; a runnable Next.js dev server; `npm test` wired to vitest.

- [ ] **Step 1: Create the repo from the template**

```bash
gh repo create life-app --template akhiljayaraj/template-app --private --clone
cd life-app
./scripts/bootstrap.sh
```
Then read the template's own `CLAUDE.md` for its conventions before proceeding. If the template does not already contain a Next.js app, continue to Step 2 to add one; if it conflicts, prefer the template's CI/config and layer the app underneath.

- [ ] **Step 2: Initialize the Next.js app in place**

```bash
npx create-next-app@latest . --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm
```
(Accept merging into the existing directory. Tailwind optional — omitted here to keep styling explicit; add later if desired.)

- [ ] **Step 3: Add dependencies**

```bash
npm install @supabase/supabase-js zod recharts gray-matter
npm install -D vitest tsx @types/node
```

- [ ] **Step 4: Add scripts and vitest config**

In `package.json` add:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "test": "vitest run",
  "ingest": "tsx scripts/ingest-run.ts"
}
```
Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 5: Config module and env template**

Create `lib/config.ts`:
```ts
export const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001";
export function getVaultPath(): string {
  const p = process.env.VAULT_PATH;
  if (!p) throw new Error("VAULT_PATH is not set (see .env.example)");
  return p;
}
```
Create `.env.example`:
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
VAULT_PATH=/Users/akhil/Library/Mobile Documents/iCloud~md~obsidian/Documents/Utilities
```
Add `.env.local` to `.gitignore`.

- [ ] **Step 6: Verify the app boots and tests run**

Run: `npm run dev` (confirm http://localhost:3000 loads) then stop it; run `npm test` (expected: "no test files" — passes trivially).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold life-app (Next.js + tooling)"
```

---

### Task 2: Supabase schema migration + seed

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: tables `calendar_events`, `tasks`, `health_metrics`, `finance_accounts`, `finance_goals`, `ingest_runs` (full v1 schema, so no re-migration when fanning out), with the natural-key unique constraints and indexes the writer/read layer rely on.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_init.sql` (full v1 schema; all tables carry `id uuid primary key default gen_random_uuid()`, `user_id uuid not null`, `created_at timestamptz not null default now()`; RLS enabled as a no-op safety net):
```sql
create extension if not exists pgcrypto;

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  external_id text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  external_id text not null,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index tasks_open_idx on tasks (user_id, done, due_at);

create table health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  metric_type text not null,
  value numeric not null,
  unit text,
  recorded_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (user_id, metric_type, recorded_at, source)
);
create index health_series_idx on health_metrics (user_id, metric_type, recorded_at desc);

create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text not null,
  name text not null,
  kind text,
  balance numeric not null,
  currency text not null default 'USD',
  as_of timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, account_id)
);

create table finance_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  rows_written int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

alter table calendar_events enable row level security;
alter table tasks enable row level security;
alter table health_metrics enable row level security;
alter table finance_accounts enable row level security;
alter table finance_goals enable row level security;
alter table ingest_runs enable row level security;
```

- [ ] **Step 2: Write the seed fixture**

Create `supabase/seed.sql` (deterministic data for tests and the first render):
```sql
insert into calendar_events (user_id, source, external_id, title, starts_at, ends_at, location)
values ('00000000-0000-0000-0000-000000000001','gcal','seed-1','Standup',
        '2026-08-19T09:00:00Z','2026-08-19T09:15:00Z','Zoom');

insert into ingest_runs (user_id, source, started_at, finished_at, status, rows_written)
values ('00000000-0000-0000-0000-000000000001','gcal',
        '2026-08-19T06:00:00Z','2026-08-19T06:00:05Z','ok',1);
```

- [ ] **Step 3: Apply to the Supabase project**

Apply `0001_init.sql` then `seed.sql` to the project referenced by `SUPABASE_URL` (via the Supabase SQL editor or `psql`). Confirm the six tables exist and `calendar_events` has one seed row.

- [ ] **Step 4: Commit**

```bash
git add supabase/ && git commit -m "feat: initial Supabase schema + seed"
```

---

### Task 3: Zod payload schemas

**Files:**
- Create: `lib/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `CalendarEventPayload` (zod) with fields `{ external_id: string; title: string; starts_at: string; ends_at?: string | null; location?: string | null; raw?: unknown }`, and `parseCalendarEvents(input: unknown): CalendarEventPayload[]` which throws on invalid input. `starts_at`/`ends_at` are ISO-8601 strings.

- [ ] **Step 1: Write the failing test**

Create `tests/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCalendarEvents } from "../lib/schema";

describe("parseCalendarEvents", () => {
  it("accepts a valid event array", () => {
    const out = parseCalendarEvents([
      { external_id: "a1", title: "Standup", starts_at: "2026-08-19T09:00:00Z" },
    ]);
    expect(out[0].title).toBe("Standup");
  });

  it("rejects an event missing required fields", () => {
    expect(() => parseCalendarEvents([{ title: "no id or start" }])).toThrow();
  });

  it("rejects a non-ISO starts_at", () => {
    expect(() =>
      parseCalendarEvents([{ external_id: "a1", title: "x", starts_at: "not-a-date" }])
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL (`Cannot find module '../lib/schema'`).

- [ ] **Step 3: Write minimal implementation**

Create `lib/schema.ts`:
```ts
import { z } from "zod";

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO datetime");

export const CalendarEventPayload = z.object({
  external_id: z.string().min(1),
  title: z.string().min(1),
  starts_at: iso,
  ends_at: iso.nullish(),
  location: z.string().nullish(),
  raw: z.unknown().optional(),
});
export type CalendarEventPayload = z.infer<typeof CalendarEventPayload>;

export function parseCalendarEvents(input: unknown): CalendarEventPayload[] {
  return z.array(CalendarEventPayload).parse(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts tests/schema.test.ts && git commit -m "feat: calendar payload zod schema"
```

---

### Task 4: The deterministic writer

**Files:**
- Create: `lib/supabase.ts` (server-side client factory)
- Create: `scripts/write.ts` (the writer library + CLI entry)
- Test: `tests/write.test.ts`

**Interfaces:**
- Consumes: `parseCalendarEvents` from `lib/schema.ts`; `LOCAL_USER_ID` from `lib/config.ts`.
- Produces: `writeCalendarEvents(events: unknown, deps: WriteDeps): Promise<{ rows_written: number }>` where `WriteDeps = { db: DbPort }` and `DbPort = { upsertCalendarEvents(rows): Promise<number>; logRun(run): Promise<void> }`. Also a CLI: `tsx scripts/write.ts --source calendar` reads a JSON array of events from **stdin**.

- [ ] **Step 1: Write the failing test (validation + logging via a fake DbPort)**

Create `tests/write.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { writeCalendarEvents } from "../scripts/write";

function fakeDb() {
  const state = { upserted: [] as any[], runs: [] as any[] };
  return {
    state,
    port: {
      async upsertCalendarEvents(rows: any[]) { state.upserted.push(...rows); return rows.length; },
      async logRun(run: any) { state.runs.push(run); },
    },
  };
}

describe("writeCalendarEvents", () => {
  it("upserts valid events and logs an ok run", async () => {
    const db = fakeDb();
    const res = await writeCalendarEvents(
      [{ external_id: "a1", title: "Standup", starts_at: "2026-08-19T09:00:00Z" }],
      { db: db.port }
    );
    expect(res.rows_written).toBe(1);
    expect(db.state.upserted[0].user_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(db.state.upserted[0].source).toBe("gcal");
    expect(db.state.runs[0].status).toBe("ok");
  });

  it("logs an error run and writes nothing on invalid input", async () => {
    const db = fakeDb();
    await expect(
      writeCalendarEvents([{ title: "bad" }], { db: db.port })
    ).rejects.toThrow();
    expect(db.state.upserted).toHaveLength(0);
    expect(db.state.runs[0].status).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/write.test.ts`
Expected: FAIL (`Cannot find module '../scripts/write'`).

- [ ] **Step 3: Write the writer (library part)**

Create `scripts/write.ts`:
```ts
import { parseCalendarEvents } from "../lib/schema";
import { LOCAL_USER_ID } from "../lib/config";

export type CalendarRow = {
  user_id: string; source: "gcal"; external_id: string; title: string;
  starts_at: string; ends_at: string | null; location: string | null; raw: unknown;
};
export type IngestRun = {
  user_id: string; source: string; started_at: string; finished_at: string;
  status: "ok" | "partial" | "error"; rows_written: number; error: string | null;
};
export interface DbPort {
  upsertCalendarEvents(rows: CalendarRow[]): Promise<number>;
  logRun(run: IngestRun): Promise<void>;
}
export interface WriteDeps { db: DbPort; }

export async function writeCalendarEvents(input: unknown, deps: WriteDeps) {
  const started_at = new Date().toISOString();
  try {
    const events = parseCalendarEvents(input); // throws on invalid
    const rows: CalendarRow[] = events.map((e) => ({
      user_id: LOCAL_USER_ID, source: "gcal", external_id: e.external_id, title: e.title,
      starts_at: e.starts_at, ends_at: e.ends_at ?? null, location: e.location ?? null,
      raw: e.raw ?? null,
    }));
    const rows_written = await deps.db.upsertCalendarEvents(rows);
    await deps.db.logRun({ user_id: LOCAL_USER_ID, source: "gcal", started_at,
      finished_at: new Date().toISOString(), status: "ok", rows_written, error: null });
    return { rows_written };
  } catch (err) {
    await deps.db.logRun({ user_id: LOCAL_USER_ID, source: "gcal", started_at,
      finished_at: new Date().toISOString(), status: "error", rows_written: 0,
      error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/write.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the real DbPort (Supabase) + CLI entry**

Create `lib/supabase.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
export function serverClient() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}
```
Add `import { serverClient } from "../lib/supabase";` to the **top** of `scripts/write.ts` (with the other imports), then append the following to the end of the file:
```ts
export function supabaseDbPort(): DbPort {
  const db = serverClient();
  return {
    async upsertCalendarEvents(rows) {
      const { error } = await db.from("calendar_events")
        .upsert(rows, { onConflict: "user_id,source,external_id" });
      if (error) throw new Error(error.message);
      return rows.length;
    },
    async logRun(run) {
      const { error } = await db.from("ingest_runs").insert(run);
      if (error) throw new Error(error.message);
    },
  };
}

// CLI: `tsx scripts/write.ts --source calendar` reads a JSON array from stdin.
if (process.argv[1]?.endsWith("write.ts")) {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (c) => chunks.push(c));
  process.stdin.on("end", async () => {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    try {
      const res = await writeCalendarEvents(input, { db: supabaseDbPort() });
      console.log(JSON.stringify(res));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
}
```

- [ ] **Step 6: Manual smoke of the CLI writer**

Run: `echo '[{"external_id":"cli-1","title":"CLI test","starts_at":"2026-08-19T10:00:00Z"}]' | npx tsx scripts/write.ts --source calendar`
Expected: prints `{"rows_written":1}`; a new `calendar_events` row and an `ok` `ingest_runs` row appear in Supabase. Re-run the same command → still one `cli-1` row (idempotent).

- [ ] **Step 7: Commit**

```bash
git add lib/supabase.ts scripts/write.ts tests/write.test.ts && git commit -m "feat: deterministic calendar writer + Supabase port"
```

---

### Task 5: The read layer

**Files:**
- Create: `lib/data/index.ts`
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: `serverClient` from `lib/supabase.ts`; `LOCAL_USER_ID` from `lib/config.ts`.
- Produces: `getAgenda(deps?): Promise<AgendaItem[]>` where `AgendaItem = { title: string; starts_at: string; ends_at: string | null; location: string | null }`, and `getLastSync(deps?): Promise<{ source: string; finished_at: string | null; status: string } | null>`. Both accept an optional `{ db }` for testing and default to `serverClient()`.

- [ ] **Step 1: Write the failing test (with a fake query builder)**

Create `tests/data.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getAgenda } from "../lib/data";

function fakeDb(rows: any[]) {
  const q: any = {
    select: () => q, eq: () => q, gte: () => q, order: () => q,
    then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return { from: () => q };
}

describe("getAgenda", () => {
  it("returns mapped agenda items for the local user", async () => {
    const db = fakeDb([
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ]);
    const out = await getAgenda({ db: db as any });
    expect(out).toEqual([
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL (`Cannot find module '../lib/data'`).

- [ ] **Step 3: Write minimal implementation**

Create `lib/data/index.ts`:
```ts
import { serverClient } from "../supabase";
import { LOCAL_USER_ID } from "../config";

export type AgendaItem = { title: string; starts_at: string; ends_at: string | null; location: string | null };
export type LastSync = { source: string; finished_at: string | null; status: string };
type Deps = { db?: ReturnType<typeof serverClient> };

export async function getAgenda(deps: Deps = {}): Promise<AgendaItem[]> {
  const db = deps.db ?? serverClient();
  const { data, error } = await db.from("calendar_events")
    .select("title, starts_at, ends_at, location")
    .eq("user_id", LOCAL_USER_ID)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaItem[];
}

export async function getLastSync(deps: Deps = {}): Promise<LastSync | null> {
  const db = deps.db ?? serverClient();
  const { data, error } = await db.from("ingest_runs")
    .select("source, finished_at, status")
    .eq("user_id", LOCAL_USER_ID)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as LastSync) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/ tests/data.test.ts && git commit -m "feat: read layer (getAgenda, getLastSync)"
```

---

### Task 6: The `life-ingest` Claude Code plugin (calendar)

**Files:**
- Create: `life-ingest/commands/ingest.md`
- Create: `life-ingest/skills/ingest-calendar/SKILL.md`
- Create: `life-ingest/.mcp.json`
- Create: `scripts/ingest-run.ts` (thin launcher invoked by `npm run ingest` / launchd)

**Interfaces:**
- Consumes: the CLI `tsx scripts/write.ts --source calendar` (stdin = JSON array) from Task 4.
- Produces: a `/ingest` command that, for `calendar`, pulls today's events via the Google Calendar MCP and pipes a normalized array to the writer.

- [ ] **Step 1: Declare the MCP server**

Create `life-ingest/.mcp.json` (Google Calendar MCP; the owner authorizes it in Claude Code):
```json
{ "mcpServers": { "google-calendar": { "type": "http", "url": "https://mcp.google.com/calendar" } } }
```
(Exact URL/transport is confirmed against the owner's available connectors at execution time; the point is the plugin declares one calendar MCP server named `google-calendar`.)

- [ ] **Step 2: Write the calendar skill**

Create `life-ingest/skills/ingest-calendar/SKILL.md`:
```markdown
---
name: ingest-calendar
description: Fetch today's Google Calendar events and write them to the life-app store.
---

# Ingest — Google Calendar

1. Use the `google-calendar` MCP server to list events for **today** (local time), including title, start, end, and location.
2. Normalize each event to this exact shape (an array):
   `{ "external_id": <stable event id>, "title": <string>, "starts_at": <ISO-8601 UTC>, "ends_at": <ISO-8601 UTC or null>, "location": <string or null>, "raw": <the original event object> }`
   - `external_id` MUST be the calendar's stable event id (so re-runs upsert, not duplicate).
   - Times MUST be ISO-8601. Do not invent or infer fields; copy the source values.
3. Write the array by piping it to the deterministic writer — do NOT write to the database yourself:
   `echo '<the JSON array>' | npx tsx scripts/write.ts --source calendar`
4. Report the writer's output (`rows_written`) and stop. If the writer exits non-zero, report its error verbatim; do not retry with altered data.
```

- [ ] **Step 3: Write the command**

Create `life-ingest/commands/ingest.md`:
```markdown
---
description: Ingest life data from external sources into the store.
argument-hint: "[source]  (default: all)"
---

Ingest the requested source(s) into the life-app store, then report a one-line status per source (source, rows_written or error).

- If `$ARGUMENTS` is empty or `all`: run every available source skill.
- If `$ARGUMENTS` names a source (e.g. `calendar`): run only that source's skill.

For `calendar`, use the **ingest-calendar** skill. Never write to the database directly — always pipe normalized data to `scripts/write.ts`.
```

- [ ] **Step 4: Thin launcher for scheduled/headless runs**

Create `scripts/ingest-run.ts` (lets `npm run ingest` and launchd invoke Claude Code headlessly):
```ts
import { spawnSync } from "node:child_process";
const source = process.argv[2] ?? "all";
const r = spawnSync("claude", ["-p", `/ingest ${source}`], { stdio: "inherit" });
process.exit(r.status ?? 1);
```

- [ ] **Step 5: Dry-run the plugin against the real calendar**

Ensure the plugin is loaded in Claude Code and the `google-calendar` MCP server is authorized. Run: `claude -p "/ingest calendar"` (or `npm run ingest calendar`).
Expected: today's events appear as `calendar_events` rows for `LOCAL_USER_ID`; an `ok` `ingest_runs` row is written. Re-run → no duplicates.

- [ ] **Step 6: Commit**

```bash
git add life-ingest/ scripts/ingest-run.ts && git commit -m "feat: life-ingest plugin (calendar) + headless launcher"
```

---

### Task 7: The `ai-engine` module

**Files:**
- Create: `lib/ai-engine.ts`
- Test: `tests/ai-engine.test.ts`

**Interfaces:**
- Produces: `summarize(context: string, deps?: { run?: Runner }): Promise<string>` where `Runner = (prompt: string) => { status: number; stdout: string }`. Default runner shells `claude -p <prompt>`. Used by the briefing widget now and later tabs.

- [ ] **Step 1: Write the failing test (inject a fake runner)**

Create `tests/ai-engine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { summarize } from "../lib/ai-engine";

describe("summarize", () => {
  it("passes the context to the runner and returns trimmed stdout", async () => {
    let seen = "";
    const run = (prompt: string) => { seen = prompt; return { status: 0, stdout: "  Your day looks calm.\n" }; };
    const out = await summarize("agenda: standup 9am", { run });
    expect(seen).toContain("agenda: standup 9am");
    expect(out).toBe("Your day looks calm.");
  });

  it("throws when the runner exits non-zero", async () => {
    const run = () => ({ status: 1, stdout: "" });
    await expect(summarize("x", { run })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-engine.test.ts`
Expected: FAIL (`Cannot find module '../lib/ai-engine'`).

- [ ] **Step 3: Write minimal implementation**

Create `lib/ai-engine.ts`:
```ts
import { spawnSync } from "node:child_process";

export type Runner = (prompt: string) => { status: number; stdout: string };

const defaultRunner: Runner = (prompt) => {
  const r = spawnSync("claude", ["-p", prompt], { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
};

export async function summarize(context: string, deps: { run?: Runner } = {}): Promise<string> {
  const run = deps.run ?? defaultRunner;
  const prompt = `You are a concise personal assistant. Given the user's data below, write a 2-3 sentence briefing of their day. Be direct, no preamble.\n\n${context}`;
  const { status, stdout } = run(prompt);
  if (status !== 0) throw new Error(`ai-engine: claude exited ${status}`);
  return stdout.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai-engine.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai-engine.ts tests/ai-engine.test.ts && git commit -m "feat: ai-engine Claude Code wrapper"
```

---

### Task 8: The dashboard UI + server actions

**Files:**
- Create: `app/actions.ts`
- Create: `app/components/AgendaWidget.tsx`, `app/components/LastSynced.tsx`, `app/components/RefreshButton.tsx`, `app/components/Briefing.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getAgenda`, `getLastSync` from `lib/data`; `summarize` from `lib/ai-engine`.
- Produces: a dashboard page rendering agenda + last-synced + briefing, a `refresh()` server action (shells `/ingest`), and a `briefing()` server action.

- [ ] **Step 1: Server actions**

Create `app/actions.ts`:
```ts
"use server";
import { spawnSync } from "node:child_process";
import { revalidatePath } from "next/cache";
import { getAgenda, getLastSync } from "@/lib/data";
import { summarize } from "@/lib/ai-engine";

export async function refresh() {
  spawnSync("claude", ["-p", "/ingest calendar"], { stdio: "inherit" });
  revalidatePath("/");
}

export async function briefing(): Promise<string> {
  const [agenda, sync] = await Promise.all([getAgenda(), getLastSync()]);
  const ctx = `Last synced: ${sync?.finished_at ?? "never"} (${sync?.status ?? "n/a"}).\n` +
    `Agenda:\n` + agenda.map((a) => `- ${a.title} at ${a.starts_at}`).join("\n");
  return summarize(ctx);
}
```

- [ ] **Step 2: Presentational components**

Create `app/components/AgendaWidget.tsx`:
```tsx
import type { AgendaItem } from "@/lib/data";
export function AgendaWidget({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) return <section><h2>Today's agenda</h2><p>Nothing scheduled.</p></section>;
  return (
    <section>
      <h2>Today's agenda</h2>
      <ul>{items.map((a, i) => (
        <li key={i}>{new Date(a.starts_at).toLocaleTimeString()} — {a.title}{a.location ? ` (${a.location})` : ""}</li>
      ))}</ul>
    </section>
  );
}
```
Create `app/components/LastSynced.tsx`:
```tsx
import type { LastSync } from "@/lib/data";
export function LastSynced({ sync }: { sync: LastSync | null }) {
  if (!sync) return <p>Never synced.</p>;
  return <p>Last synced {new Date(sync.finished_at ?? "").toLocaleString()} · {sync.status}</p>;
}
```
Create `app/components/RefreshButton.tsx`:
```tsx
"use client";
import { refresh } from "@/app/actions";
import { useTransition } from "react";
export function RefreshButton() {
  const [pending, start] = useTransition();
  return <button disabled={pending} onClick={() => start(() => refresh())}>{pending ? "Refreshing…" : "Refresh now"}</button>;
}
```
Create `app/components/Briefing.tsx`:
```tsx
"use client";
import { briefing } from "@/app/actions";
import { useState, useTransition } from "react";
export function Briefing() {
  const [text, setText] = useState<string>("");
  const [pending, start] = useTransition();
  return (
    <section>
      <h2>✨ Daily briefing</h2>
      {text ? <p>{text}</p> : <p>No briefing yet.</p>}
      <button disabled={pending} onClick={() => start(async () => { try { setText(await briefing()); } catch { setText("Briefing unavailable — retry."); } })}>
        {pending ? "Thinking…" : "Generate"}
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Compose the page**

Replace `app/page.tsx`:
```tsx
import { getAgenda, getLastSync } from "@/lib/data";
import { AgendaWidget } from "@/app/components/AgendaWidget";
import { LastSynced } from "@/app/components/LastSynced";
import { RefreshButton } from "@/app/components/RefreshButton";
import { Briefing } from "@/app/components/Briefing";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [agenda, sync] = await Promise.all([getAgenda(), getLastSync()]);
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <LastSynced sync={sync} />
        <RefreshButton />
      </header>
      <AgendaWidget items={agenda} />
      <Briefing />
    </main>
  );
}
```

- [ ] **Step 4: Verify it renders against seed data**

Run: `npm run dev`, open http://localhost:3000. Expected: the seeded "Standup" agenda item and a "last synced" line render; "Refresh now" and "Generate" buttons are present.

- [ ] **Step 5: Commit**

```bash
git add app/ && git commit -m "feat: dashboard UI (agenda, last-synced, refresh, briefing)"
```

---

### Task 9: Scheduled ingestion via launchd

**Files:**
- Create: `deploy/com.life-app.ingest.plist`
- Create: `deploy/README.md`

**Interfaces:**
- Consumes: `npm run ingest calendar` (Task 6).

- [ ] **Step 1: Write the launchd plist**

Create `deploy/com.life-app.ingest.plist` (runs every 6h; adjust the `WorkingDirectory` and paths at install time):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.life-app.ingest</string>
  <key>WorkingDirectory</key><string>/Users/akhil/life-app</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-lc</string><string>npm run ingest calendar</string></array>
  <key>StartInterval</key><integer>21600</integer>
  <key>StandardOutPath</key><string>/tmp/life-app-ingest.log</string>
  <key>StandardErrorPath</key><string>/tmp/life-app-ingest.err</string>
</dict></plist>
```

- [ ] **Step 2: Document install/uninstall**

Create `deploy/README.md`:
```markdown
# Scheduled ingestion (macOS launchd)

Install:  `cp deploy/com.life-app.ingest.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.life-app.ingest.plist`
Run now:  `launchctl start com.life-app.ingest`
Logs:     `/tmp/life-app-ingest.log`, `/tmp/life-app-ingest.err`
Uninstall:`launchctl unload ~/Library/LaunchAgents/com.life-app.ingest.plist`

Requires Claude Code logged in (Max subscription) and the google-calendar MCP authorized in the same user context.
```

- [ ] **Step 3: Install and fire once**

Install per the README, then `launchctl start com.life-app.ingest`. Expected: the log shows an ingest run; fresh `calendar_events` / `ingest_runs` rows appear.

- [ ] **Step 4: Commit**

```bash
git add deploy/ && git commit -m "chore: launchd schedule for 6h calendar ingest"
```

---

### Task 10: End-to-end smoke check

**Files:** none (verification only).

- [ ] **Step 1: Full vertical run**

1. `npm test` → all unit tests pass (schema, write, data, ai-engine).
2. `npm run ingest calendar` → today's real events land in Supabase; an `ok` `ingest_runs` row is written.
3. `npm run dev` → the dashboard shows today's agenda (not just the seed), a fresh "last synced," and "Generate" produces a briefing.
4. Click "Refresh now" → agenda re-renders; no duplicate rows in `calendar_events`.

- [ ] **Step 2: Record the result**

Note pass/fail of each step. Any failure re-opens the relevant task rather than being patched over.

---

## Notes for the executor
- The template repo (Task 1) may already carry CI, a project board, and its own `CLAUDE.md`; honor those. If the template lacks a Next.js app, `create-next-app` into the same directory as shown.
- The Google Calendar MCP server URL/transport (Task 6) is confirmed against the owner's actual connectors at execution time; the plugin only needs one calendar MCP server named `google-calendar`.
- `claude -p "/ingest …"` requires the `life-ingest` plugin to be discoverable by Claude Code in the working directory and the owner logged into a Max subscription.
