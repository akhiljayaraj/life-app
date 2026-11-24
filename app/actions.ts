"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAgenda, getLastSync } from "@/lib/data";
import { summarize } from "@/lib/ai-engine";
import { runIngest } from "@/lib/claude";
import { isLocalHost, singleFlight } from "@/lib/guard";

// Single-user, local-only app: these actions spawn processes, so refuse non-loopback requests.
async function assertLocal() {
  if (!isLocalHost((await headers()).get("host"))) throw new Error("forbidden");
}

const ingestOnce = singleFlight(() => runIngest("calendar"), 30_000);
const briefOnce = singleFlight(async () => {
  const [agenda, sync] = await Promise.all([getAgenda(), getLastSync()]);
  return summarize(
    `Last synced: ${sync?.finished_at ?? "never"} (${sync?.status ?? "n/a"}).\n` +
      `Agenda:\n` +
      agenda.map((a) => `- ${a.title} at ${a.starts_at}`).join("\n"),
  );
}, 5_000);

export async function refresh() {
  await assertLocal();
  try {
    await ingestOnce();
  } catch {
    // Ingest failures are recorded in ingest_runs and surfaced via the "last synced" indicator;
    // the action still revalidates so the dashboard reflects whatever landed.
  }
  revalidatePath("/");
}

export async function briefing(): Promise<string> {
  await assertLocal();
  return (await briefOnce()) ?? "Please wait a few seconds before generating another briefing.";
}
