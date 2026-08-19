import type { LastSync } from "@/lib/data";

export function LastSynced({ sync }: { sync: LastSync | null }) {
  if (!sync) return <p>Never synced.</p>;
  const when = sync.finished_at ? new Date(sync.finished_at).toLocaleString() : "in progress";
  return (
    <p>
      Last synced {when} · {sync.status}
    </p>
  );
}
