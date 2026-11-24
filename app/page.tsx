import { getAgenda, getLastSync, isConfigured } from "@/lib/data";
import { AgendaWidget } from "@/app/components/AgendaWidget";
import { LastSynced } from "@/app/components/LastSynced";
import { RefreshButton } from "@/app/components/RefreshButton";
import { Briefing } from "@/app/components/Briefing";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [agenda, sync] = await Promise.all([getAgenda(), getLastSync()]);
  const configured = isConfigured();
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Life App</h1>
      {!configured && (
        <p
          style={{
            background: "#fff6e5",
            border: "1px solid #f0c36d",
            borderRadius: 8,
            padding: "0.75rem 1rem",
          }}
        >
          Supabase isn&apos;t configured yet — showing empty state. Add <code>SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_KEY</code> to <code>.env.local</code> and apply{" "}
          <code>supabase/migrations/0001_init.sql</code> + <code>supabase/seed.sql</code>. See{" "}
          <code>docs/MORNING-CHECKLIST.md</code>.
        </p>
      )}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <LastSynced sync={sync} />
        <RefreshButton />
      </header>
      <AgendaWidget items={agenda} />
      <Briefing />
    </main>
  );
}
