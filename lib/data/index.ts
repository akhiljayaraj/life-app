import { serverClient } from "../supabase";
import { LOCAL_USER_ID } from "../config";

export type AgendaItem = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
};
export type LastSync = { source: string; finished_at: string | null; status: string };
type Deps = { db?: ReturnType<typeof serverClient> };

export async function getAgenda(deps: Deps = {}): Promise<AgendaItem[]> {
  const db = deps.db ?? serverClient();
  const { data, error } = await db
    .from("calendar_events")
    .select("title, starts_at, ends_at, location")
    .eq("user_id", LOCAL_USER_ID)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaItem[];
}

export async function getLastSync(deps: Deps = {}): Promise<LastSync | null> {
  const db = deps.db ?? serverClient();
  const { data, error } = await db
    .from("ingest_runs")
    .select("source, finished_at, status")
    .eq("user_id", LOCAL_USER_ID)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as LastSync) ?? null;
}
