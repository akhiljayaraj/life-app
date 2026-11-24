import { describe, it, expect } from "vitest";
import { summarize } from "../lib/ai-engine";

describe("summarize", () => {
  it("passes the context to the runner and returns trimmed stdout", async () => {
    let seen = "";
    const run = (prompt: string) => {
      seen = prompt;
      return { status: 0, stdout: "  Your day looks calm.\n" };
    };
    const out = await summarize("agenda: standup 9am", { run });
    expect(seen).toContain("agenda: standup 9am");
    expect(out).toBe("Your day looks calm.");
  });

  it("throws when the runner exits non-zero", async () => {
    const run = () => ({ status: 1, stdout: "" });
    await expect(summarize("x", { run })).rejects.toThrow();
  });
});
