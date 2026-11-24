import { describe, it, expect } from "vitest";
import { getAgenda, getLastSync, type AgendaItem, type LastSync } from "../lib/data";
import { LOCAL_USER_ID } from "../lib/config";

type Call = { method: string; args: unknown[] };

interface FakeQuery {
  select: (...a: unknown[]) => FakeQuery;
  eq: (...a: unknown[]) => FakeQuery;
  gte: (...a: unknown[]) => FakeQuery;
  order: (...a: unknown[]) => FakeQuery;
  limit: (...a: unknown[]) => FakeQuery;
  then: (res: (v: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
}

function fakeDb(rows: unknown[]) {
  const calls: Call[] = [];
  const q: FakeQuery = {
    select: (...args) => (calls.push({ method: "select", args }), q),
    eq: (...args) => (calls.push({ method: "eq", args }), q),
    gte: (...args) => (calls.push({ method: "gte", args }), q),
    order: (...args) => (calls.push({ method: "order", args }), q),
    limit: (...args) => (calls.push({ method: "limit", args }), q),
    then: (res) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return {
    calls,
    db: {
      from: (...args: unknown[]) => (calls.push({ method: "from", args }), q),
    },
  };
}

type DbParam = NonNullable<Parameters<typeof getAgenda>[0]>["db"];

describe("getAgenda", () => {
  it("returns mapped agenda items", async () => {
    const rows: AgendaItem[] = [
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ];
    const fake = fakeDb(rows);
    const out = await getAgenda({ db: fake.db as unknown as DbParam });
    expect(out).toEqual(rows);
  });

  it("scopes to the local user, filters to today, and orders ascending", async () => {
    const fake = fakeDb([]);
    await getAgenda({ db: fake.db as unknown as DbParam });
    expect(fake.calls).toContainEqual({ method: "from", args: ["calendar_events"] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["user_id", LOCAL_USER_ID] });
    const gte = fake.calls.find((c) => c.method === "gte");
    expect(gte?.args[0]).toBe("starts_at"); // today filter present (I1)
    expect(fake.calls).toContainEqual({ method: "order", args: ["starts_at", { ascending: true }] });
  });
});

describe("getLastSync", () => {
  it("returns the most recent run, scoped and ordered by started_at desc", async () => {
    const rows: LastSync[] = [{ source: "gcal", finished_at: "2026-08-19T06:00:05Z", status: "ok" }];
    const fake = fakeDb(rows);
    const out = await getLastSync({ db: fake.db as unknown as DbParam });
    expect(out).toEqual(rows[0]);
    expect(fake.calls).toContainEqual({ method: "from", args: ["ingest_runs"] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["user_id", LOCAL_USER_ID] });
    expect(fake.calls).toContainEqual({ method: "order", args: ["started_at", { ascending: false }] });
    expect(fake.calls).toContainEqual({ method: "limit", args: [1] });
  });

  it("returns null when there are no runs", async () => {
    const fake = fakeDb([]);
    const out = await getLastSync({ db: fake.db as unknown as DbParam });
    expect(out).toBeNull();
  });
});
