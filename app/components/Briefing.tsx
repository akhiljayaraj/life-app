"use client";
import { useState, useTransition } from "react";
import { briefing } from "@/app/actions";

export function Briefing() {
  const [text, setText] = useState<string>("");
  const [pending, start] = useTransition();
  return (
    <section>
      <h2>✨ Daily briefing</h2>
      {text ? <p>{text}</p> : <p>No briefing yet.</p>}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setText(await briefing());
            } catch {
              setText("Briefing unavailable — retry.");
            }
          })
        }
      >
        {pending ? "Thinking…" : "Generate"}
      </button>
    </section>
  );
}
