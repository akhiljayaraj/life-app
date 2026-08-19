"use server";
import { spawnSync } from "node:child_process";
import { revalidatePath } from "next/cache";
import { getAgenda, getLastSync } from "@/lib/data";
import { summarize } from "@/lib/ai-engine";

export async function refresh() {
  spawnSync("claude", ["-p", "/ingest calendar"], { stdio: "inherit" });
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
