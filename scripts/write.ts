import { readFileSync } from "node:fs";
import { parseCalendarEvents } from "../lib/schema";
import { LOCAL_USER_ID } from "../lib/config";
import { serverClient } from "../lib/supabase";

export type CalendarRow = {
  user_id: string;
  source: "gcal";
  external_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  raw: unknown;
};
export type IngestRun = {
  user_id: string;
  source: string;
  started_at: string;
  finished_at: string;
  status: "ok" | "partial" | "error";
  rows_written: number;
  error: string | null;
};
export interface DbPort {
  upsertCalendarEvents(rows: CalendarRow[]): Promise<number>;
  logRun(run: IngestRun): Promise<void>;
}
export interface WriteDeps {
  db: DbPort;
}

export async function writeCalendarEvents(input: unknown, deps: WriteDeps) {
  const started_at = new Date().toISOString();
  try {
    const events = parseCalendarEvents(input); // throws on invalid
    const rows: CalendarRow[] = events.map((e) => ({
      user_id: LOCAL_USER_ID,
      source: "gcal",
      external_id: e.external_id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at ?? null,
      location: e.location ?? null,
      raw: e.raw ?? null,
    }));
    const rows_written = await deps.db.upsertCalendarEvents(rows);
    await deps.db.logRun({
      user_id: LOCAL_USER_ID,
      source: "gcal",
      started_at,
      finished_at: new Date().toISOString(),
      status: "ok",
      rows_written,
      error: null,
    });
    return { rows_written };
  } catch (err) {
    await deps.db.logRun({
      user_id: LOCAL_USER_ID,
      source: "gcal",
      started_at,
      finished_at: new Date().toISOString(),
      status: "error",
      rows_written: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function supabaseDbPort(): DbPort {
  const db = serverClient();
  return {
    async upsertCalendarEvents(rows) {
      const { error } = await db
        .from("calendar_events")
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

// CLI: `tsx scripts/write.ts --source calendar` reads a JSON array from
// `--file <path>` if given, otherwise from stdin.
if (process.argv[1]?.endsWith("write.ts")) {
  const sourceArg = process.argv[process.argv.indexOf("--source") + 1];
  if (sourceArg !== "calendar") {
    console.error(
      `unsupported --source: ${sourceArg ?? "(none)"}; only 'calendar' is supported in phase 1`,
    );
    process.exit(1);
  }
  const fileIdx = process.argv.indexOf("--file");
  const main = async () => {
    const port = supabaseDbPort();
    const raw = readFileSync(fileIdx === -1 ? 0 : process.argv[fileIdx + 1], "utf8");
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch (e) {
      // A malformed envelope (not a schema-invalid payload) still gets an error run logged,
      // so the observability net in spec §8 catches it too.
      const now = new Date().toISOString();
      await port.logRun({
        user_id: LOCAL_USER_ID,
        source: "gcal",
        started_at: now,
        finished_at: now,
        status: "error",
        rows_written: 0,
        error: `invalid JSON input: ${e instanceof Error ? e.message : String(e)}`,
      });
      console.error("invalid JSON input");
      process.exit(1);
    }
    try {
      const res = await writeCalendarEvents(input, { db: port });
      console.log(JSON.stringify(res));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  };
  void main();
}
