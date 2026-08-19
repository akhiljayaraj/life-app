import { describe, it, expect } from "vitest";
import { parseCalendarEvents } from "../lib/schema";

describe("parseCalendarEvents", () => {
  it("accepts a valid event array", () => {
    const out = parseCalendarEvents([
      { external_id: "a1", title: "Standup", starts_at: "2026-08-19T09:00:00Z" },
    ]);
    expect(out[0].title).toBe("Standup");
  });

  it("rejects an event missing required fields", () => {
    expect(() => parseCalendarEvents([{ title: "no id or start" }])).toThrow();
  });

  it("rejects a non-ISO starts_at", () => {
    expect(() =>
      parseCalendarEvents([{ external_id: "a1", title: "x", starts_at: "not-a-date" }]),
    ).toThrow();
  });
});
