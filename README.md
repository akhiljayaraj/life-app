# life-app

A local-first personal dashboard. Phase 1 covers the calendar path end to end: an agent fetches events, a deterministic writer stores them in Postgres, and a Next.js dashboard displays them with an on-demand AI briefing.

> Status: Phase 1 code is complete and tested with fakes. Live calendar ingestion still needs the setup in [docs/MORNING-CHECKLIST.md](docs/MORNING-CHECKLIST.md).

## Design

```
Google Calendar -> Claude Code agent (fetch + normalize) -> .ingest/calendar.json
                -> scripts/write.ts (validate + idempotent upsert) -> Supabase
                -> lib/data -> Next.js dashboard
```

- **Agentic fetch, deterministic write.** The agent never writes to the database. `scripts/write.ts` validates with zod, upserts on a stable key, and logs every run.
- **Two stores.** An Obsidian vault for human-written notes (planned) and Postgres for machine-ingested data.
- **Narrow seams.** The UI reads through `lib/data`; the AI engine sits behind one module.

## Security model

Calendar content is untrusted and the app is single-user.

- Event data never appears in a shell command.
- Ingestion gets an allowlist: calendar reads, one output directory, one exact writer command.
- The briefing agent has no tools, no MCP servers, and no database credentials in its environment.
- The server binds to loopback; server actions check the host, are single-flight, and time out.

## Run

```bash
npm ci
cp .env.example .env.local   # optional: the UI renders an empty state without it
npm run dev                  # http://127.0.0.1:3000
npm run lint && npm run typecheck && npm test && npm run build
```

Stack: Next.js, React, TypeScript, Supabase, zod, Vitest.
Design docs: [docs/superpowers](docs/superpowers).
