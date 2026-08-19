import { describe, it, expect } from "vitest";
import {
  writeCalendarEvents,
  type DbPort,
  type CalendarRow,
  type IngestRun,
} from "../scripts/write";

function fakeDb() {
  const state = { upserted: [] as CalendarRow[], runs: [] as IngestRun[] };
  const port: DbPort = {
    async upsertCalendarEvents(rows) {
      state.upserted.push(...rows);
      return rows.length;
    },
    async logRun(run) {
      state.runs.push(run);
    },
  };
  return { state, port };
}

describe("writeCalendarEvents", () => {
  it("upserts valid events and logs an ok run", async () => {
    const db = fakeDb();
    const res = await writeCalendarEvents(
      [{ external_id: "a1", title: "Standup", starts_at: "2026-08-19T09:00:00Z" }],
      { db: db.port },
    );
    expect(res.rows_written).toBe(1);
    expect(db.state.upserted[0].user_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(db.state.upserted[0].source).toBe("gcal");
    expect(db.state.runs[0].status).toBe("ok");
  });

  it("logs an error run and writes nothing on invalid input", async () => {
    const db = fakeDb();
    await expect(writeCalendarEvents([{ title: "bad" }], { db: db.port })).rejects.toThrow();
    expect(db.state.upserted).toHaveLength(0);
    expect(db.state.runs[0].status).toBe("error");
  });
});
