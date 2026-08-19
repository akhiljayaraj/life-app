import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

export type RunResult = { status: number; stdout: string };
export type Runner = (prompt: string) => RunResult | Promise<RunResult>;

const defaultRunner: Runner = async (prompt) => {
  try {
    const { stdout } = await pExecFile("claude", ["-p", prompt], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { status: 0, stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { status: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "" };
  }
};

export async function summarize(context: string, deps: { run?: Runner } = {}): Promise<string> {
  const run = deps.run ?? defaultRunner;
  const prompt =
    `You are a concise personal assistant. Given the user's data below, write a 2-3 sentence ` +
    `briefing of their day. Be direct, no preamble.\n\n${context}`;
  const { status, stdout } = await run(prompt);
  if (status !== 0) throw new Error(`ai-engine: claude exited ${status}`);
  return stdout.trim();
}
