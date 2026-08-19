import { getAgenda, getLastSync } from "@/lib/data";
import { AgendaWidget } from "@/app/components/AgendaWidget";
import { LastSynced } from "@/app/components/LastSynced";
import { RefreshButton } from "@/app/components/RefreshButton";
import { Briefing } from "@/app/components/Briefing";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [agenda, sync] = await Promise.all([getAgenda(), getLastSync()]);
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <LastSynced sync={sync} />
        <RefreshButton />
      </header>
      <AgendaWidget items={agenda} />
      <Briefing />
    </main>
  );
}
