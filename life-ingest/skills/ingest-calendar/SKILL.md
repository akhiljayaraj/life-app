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

## Setup notes (one-time, by the owner)

- `life-ingest/.mcp.json` currently has a **placeholder** URL for the `google-calendar` server. Replace it with your real Google Calendar MCP connector before running. Managed OAuth connectors are typically added via `claude mcp add` / the Claude Code connector UI rather than a bare URL — configure whichever your setup uses, keeping the server name `google-calendar`.
- Ensure Claude Code is logged in with your **Max subscription** and that `ANTHROPIC_API_KEY` is **unset** in the environment — otherwise the connectors are disabled and `claude` may bill the metered API.
- The writer needs `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` in the environment (see `.env.example`).
