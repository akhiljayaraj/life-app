import type { AgendaItem } from "@/lib/data";

export function AgendaWidget({ items }: { items: AgendaItem[] }) {
  if (items.length === 0)
    return (
      <section>
        <h2>Today&apos;s agenda</h2>
        <p>Nothing scheduled.</p>
      </section>
    );
  return (
    <section>
      <h2>Today&apos;s agenda</h2>
      <ul>
        {items.map((a, i) => (
          <li key={i}>
            {new Date(a.starts_at).toLocaleTimeString()} — {a.title}
            {a.location ? ` (${a.location})` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
