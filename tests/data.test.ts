import { describe, it, expect } from "vitest";
import { getAgenda, type AgendaItem } from "../lib/data";

interface FakeQuery {
  select: () => FakeQuery;
  eq: () => FakeQuery;
  gte: () => FakeQuery;
  order: () => FakeQuery;
  then: (res: (v: { data: AgendaItem[]; error: null }) => unknown) => Promise<unknown>;
}

function fakeDb(rows: AgendaItem[]) {
  const q: FakeQuery = {
    select: () => q,
    eq: () => q,
    gte: () => q,
    order: () => q,
    then: (res) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return { from: () => q };
}

describe("getAgenda", () => {
  it("returns mapped agenda items for the local user", async () => {
    const db = fakeDb([
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ]);
    const out = await getAgenda({
      db: db as unknown as NonNullable<Parameters<typeof getAgenda>[0]>["db"],
    });
    expect(out).toEqual([
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ]);
  });
});
