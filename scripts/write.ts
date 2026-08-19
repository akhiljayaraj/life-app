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

// CLI: `tsx scripts/write.ts --source calendar` reads a JSON array from stdin.
if (process.argv[1]?.endsWith("write.ts")) {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (c) => chunks.push(c as Buffer));
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
