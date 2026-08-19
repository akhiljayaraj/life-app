import { spawnSync } from "node:child_process";

export type Runner = (prompt: string) => { status: number; stdout: string };

const defaultRunner: Runner = (prompt) => {
  const r = spawnSync("claude", ["-p", prompt], { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
};

export async function summarize(context: string, deps: { run?: Runner } = {}): Promise<string> {
  const run = deps.run ?? defaultRunner;
  const prompt =
    `You are a concise personal assistant. Given the user's data below, write a 2-3 sentence ` +
    `briefing of their day. Be direct, no preamble.\n\n${context}`;
  const { status, stdout } = run(prompt);
  if (status !== 0) throw new Error(`ai-engine: claude exited ${status}`);
  return stdout.trim();
}
