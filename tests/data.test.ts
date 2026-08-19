import { describe, it, expect } from "vitest";
import { getAgenda } from "../lib/data";

function fakeDb(rows: any[]) {
  const q: any = {
    select: () => q,
    eq: () => q,
    gte: () => q,
    order: () => q,
    then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return { from: () => q };
}

describe("getAgenda", () => {
  it("returns mapped agenda items for the local user", async () => {
    const db = fakeDb([
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ]);
    const out = await getAgenda({ db: db as any });
    expect(out).toEqual([
      { title: "Standup", starts_at: "2026-08-19T09:00:00Z", ends_at: null, location: "Zoom" },
    ]);
  });
});
