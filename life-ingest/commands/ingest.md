---
description: Ingest life data from external sources into the store.
argument-hint: "[source]  (default: all)"
---

Ingest the requested source(s) into the life-app store, then report a one-line status per source (source, rows_written or error).

- If `$ARGUMENTS` is empty or `all`: run every available source skill.
- If `$ARGUMENTS` names a source (e.g. `calendar`): run only that source's skill.

For `calendar`, use the **ingest-calendar** skill. Never write to the database directly — always pass normalized data through `scripts/write.ts` as the skill describes.
