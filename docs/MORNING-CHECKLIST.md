# Morning checklist — bring Phase 1 online

Phase 1 (the Google Calendar walking skeleton) is built, committed on branch
`feat/phase1-walking-skeleton`, and the full CI contract passes locally
(lint · typecheck · unit · integration · build; 9 unit tests). Nothing is pushed.

The steps below are the **live wiring** that was deliberately deferred (they need
your logins/connectors). Do them in order.

## 0. ⚠️ Critical: fix the auth source first
A background check found `ANTHROPIC_API_KEY` (or another auth source) is set in the
environment. If it stays set:
- `claude -p` (the ingestor **and** the dashboard briefing) will bill the **metered API**,
  breaking the $0-on-Max goal, and
- your Google/claude.ai **connectors are disabled**.

Fix: `unset ANTHROPIC_API_KEY` in the shell/profile that will run the app, and confirm
`claude` is logged in with your **Max** subscription (`claude` → `/login`). Verify with a
throwaway `claude -p "say ok"` — it should answer without an API key.

## 1. Supabase project (structured store)
1. Create a free project at supabase.com.
2. Copy `.env.example` → `.env.local` and fill `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   and `VAULT_PATH` (already pre-filled to your Utilities vault).
3. Apply the schema: open the Supabase SQL editor and run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/seed.sql`
   Confirm 6 tables exist and `calendar_events` has the seed "Standup" row.

## 2. See the dashboard against seed data
```
npm run dev      # http://localhost:3000
```
Expect: the seeded "Standup" agenda item, a "last synced" line, and Refresh/Generate buttons.
(The briefing "Generate" needs step 0 working, since it calls `claude -p`.)

## 3. Wire the real Google Calendar connector
`life-ingest/.mcp.json` has a **placeholder** URL. Replace it with your actual Google
Calendar MCP connector (likely via `claude mcp add` / the Claude Code connector UI for a
managed OAuth connector), keeping the server name `google-calendar`. Make sure the
`life-ingest` plugin is discoverable by Claude Code from the repo root.

## 4. First real ingest
```
npm run ingest calendar     # or:  claude -p "/ingest calendar"
```
Expect: today's real events appear as `calendar_events` rows for the local user, and an
`ok` row in `ingest_runs`. Re-run → no duplicates (idempotent upsert). Reload the
dashboard → today's agenda (not just the seed) + a fresh "last synced".

## 5. Schedule it (6h)
Follow `deploy/README.md` to install the `launchd` job. Note: launchd doesn't read
`.env.local` — export the env vars in your profile or add an `EnvironmentVariables` dict
to the plist.

## 6. End-to-end smoke (plan Task 10)
`npm test` green → ingest populates DB → dashboard shows today → Refresh re-renders with no
dupes. Record pass/fail.

---

## Housekeeping decisions for you
- **npm audit:** `npm install` flagged some transitive-dep vulnerabilities. I did **not** run
  `npm audit fix --force` (it can force breaking major bumps). Review with `npm audit` and
  decide.
- **Push / PR:** you chose local-commits-only. When ready: `git push -u origin
  feat/phase1-walking-skeleton` and open a PR so your platform's CI/review/board engage.
- **CI ordering wrinkle:** the template runs `typecheck` before `build`, and Next generates
  types at build. I verified `tsc --noEmit` passes standalone with no `.next/` present, so CI
  is fine — but if you ever add code that depends on Next's generated route types, add a
  type-generation step before typecheck.
- **Next steps (later sub-projects):** Gmail→tasks ingest, then Apple Health / Fidelity
  (export-based), then the Tree-of-Thought and Money-Planner tabs — each its own spec+plan.
