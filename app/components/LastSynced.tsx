import type { LastSync } from "@/lib/data";

export function LastSynced({ sync }: { sync: LastSync | null }) {
  if (!sync) return <p>Never synced.</p>;
  return (
    <p>
      Last synced {new Date(sync.finished_at ?? "").toLocaleString()} · {sync.status}
    </p>
  );
}
