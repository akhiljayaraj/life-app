import { serverClient, hasServerEnv } from "../supabase";
import { LOCAL_USER_ID } from "../config";

/** True when Supabase env is configured. The UI uses this to show a setup hint. */
export function isConfigured(): boolean {
  return hasServerEnv();
}

export type AgendaItem = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
};
export type LastSync = { source: string; finished_at: string | null; status: string };
type Deps = { db?: ReturnType<typeof serverClient> };

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getAgenda(deps: Deps = {}): Promise<AgendaItem[]> {
  if (!deps.db && !hasServerEnv()) return []; // not configured yet — render empty, don't crash
  const db = deps.db ?? serverClient();
  const { data, error } = await db
    .from("calendar_events")
    .select("title, starts_at, ends_at, location")
    .eq("user_id", LOCAL_USER_ID)
    .gte("starts_at", startOfTodayISO())
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaItem[];
}

export async function getLastSync(deps: Deps = {}): Promise<LastSync | null> {
  if (!deps.db && !hasServerEnv()) return null; // not configured yet
  const db = deps.db ?? serverClient();
  const { data, error } = await db
    .from("ingest_runs")
    .select("source, finished_at, status")
    .eq("user_id", LOCAL_USER_ID)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as LastSync) ?? null;
}
