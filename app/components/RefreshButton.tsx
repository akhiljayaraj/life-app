"use client";
import { useTransition } from "react";
import { refresh } from "@/app/actions";

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => refresh())}>
      {pending ? "Refreshing…" : "Refresh now"}
    </button>
  );
}
