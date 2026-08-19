"use server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { getAgenda, getLastSync } from "@/lib/data";
import { summarize } from "@/lib/ai-engine";

const pExecFile = promisify(execFile);

export async function refresh() {
  try {
    await pExecFile("claude", ["-p", "/ingest calendar"], { maxBuffer: 10 * 1024 * 1024 });
  } catch {
    // Ingest failures are recorded in ingest_runs and surfaced via the "last synced" indicator;
    // the action still revalidates so the dashboard reflects whatever landed.
  }
  revalidatePath("/");
}

export async function briefing(): Promise<string> {
  const [agenda, sync] = await Promise.all([getAgenda(), getLastSync()]);
  const ctx =
    `Last synced: ${sync?.finished_at ?? "never"} (${sync?.status ?? "n/a"}).\n` +
    `Agenda:\n` +
    agenda.map((a) => `- ${a.title} at ${a.starts_at}`).join("\n");
  return summarize(ctx);
}
