import { describe, it, expect } from "vitest";
import { isLocalHost, singleFlight } from "../lib/guard";
import { briefingArgs, briefingEnv, ingestArgs, isIngestSource } from "../lib/claude";

describe("isLocalHost", () => {
  it("accepts loopback and rejects everything else", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"])
      expect(isLocalHost(h)).toBe(true);
    for (const h of [null, "evil.com", "localhost.evil.com", "192.168.1.2:3000"])
      expect(isLocalHost(h)).toBe(false);
  });
});

describe("singleFlight", () => {
  it("coalesces concurrent calls and applies the cooldown", async () => {
    let calls = 0;
    let t = 0;
    const f = singleFlight(async () => ++calls, 1000, () => t);
    await Promise.all([f(), f(), f()]);
    expect(calls).toBe(1);
    expect(await f()).toBeUndefined();
    t = 1001;
    expect(await f()).toBe(2);
  });
});

describe("claude invocation", () => {
  it("gives the briefing agent no tools and no secrets", () => {
    const args = briefingArgs("hi");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(briefingEnv({ HOME: "/h", SUPABASE_SERVICE_KEY: "x", ANTHROPIC_API_KEY: "y" })).toEqual({
      HOME: "/h",
    });
  });
  it("allows ingest only the exact writer command", () => {
    const bash = ingestArgs("calendar").filter((a) => a.startsWith("Bash"));
    expect(bash).toEqual([
      "Bash(npx tsx scripts/write.ts --source calendar --file .ingest/calendar.json)",
    ]);
    expect(isIngestSource("calendar; rm -rf /")).toBe(false);
  });
});
