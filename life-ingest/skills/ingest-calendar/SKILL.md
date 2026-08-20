---
name: ingest-calendar
description: Fetch today's Google Calendar events and write them to the life-app store.
---

# Ingest — Google Calendar

1. Use the `google-calendar` MCP server's `list-events` tool to list events for **today**
   (local time). `list-calendars` can find the target calendar id if needed (default: `primary`).
2. Normalize each event to this exact shape (an array):
   `{ "external_id": <the event's stable id>, "title": <string>, "starts_at": <ISO-8601 UTC>, "ends_at": <ISO-8601 UTC or null>, "location": <string or null>, "raw": <the original event object> }`
   - `external_id` MUST be the calendar event's stable id (so re-runs upsert, not duplicate).
   - Times MUST be ISO-8601. Do not invent or infer fields; copy the source values.
3. Write the array by piping it to the deterministic writer — do NOT write to the database yourself:
   `echo '<the JSON array>' | npx tsx scripts/write.ts --source calendar`
4. Report the writer's output (`rows_written`) and stop. If the writer exits non-zero, report its
   error verbatim; do not retry with altered data.

## Setup notes (one-time, by the owner)

- MCP server: `@cocal/google-calendar-mcp` (local stdio), configured in `life-ingest/.mcp.json`.
  It needs a Google OAuth **Desktop app** credentials JSON at
  `/Users/akhil/.config/life-app/gcp-oauth.keys.json` (path set in `.mcp.json`). One-time auth:
  `GOOGLE_OAUTH_CREDENTIALS=/Users/akhil/.config/life-app/gcp-oauth.keys.json npx @cocal/google-calendar-mcp@2.6.2 auth`
  (opens a browser; token is cached for headless/cron use afterward). See `docs/MORNING-CHECKLIST.md` §3.
  The version is pinned (`@2.6.2`) on purpose — this third-party server receives your Google OAuth
  credentials, so bump it deliberately after reviewing changes, not automatically.
- Ensure Claude Code is logged in with your **Max subscription** and `ANTHROPIC_API_KEY` is **unset**.
- The writer needs `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` in the environment (see `.env.example`).
