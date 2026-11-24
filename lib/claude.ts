import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

/** Fixed handoff file between the ingest agent and the deterministic writer. */
export const CALENDAR_FILE = ".ingest/calendar.json";
export const INGEST_SOURCES = ["all", "calendar"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export function isIngestSource(s: string): s is IngestSource {
  return (INGEST_SOURCES as readonly string[]).includes(s);
}

/** Least privilege: read calendars, write one file, run one exact command. */
export function ingestArgs(source: IngestSource): string[] {
  return [
    "-p",
    `/ingest ${source}`,
    "--tools",
    "Write,Bash,Skill",
    "--setting-sources",
    "project",
    "--allowedTools",
    "Skill(ingest-calendar)",
    "Write(./.ingest/**)",
    `Bash(npx tsx scripts/write.ts --source calendar --file ${CALENDAR_FILE})`,
    "mcp__google-calendar__list-events",
    "mcp__google-calendar__list-calendars",
    "--mcp-config",
    "life-ingest/.mcp.json",
    "--strict-mcp-config",
  ];
}

/** Text only: calendar content is untrusted, so the briefing agent gets no tools. */
export function briefingArgs(prompt: string): string[] {
  return ["-p", prompt, "--tools", "", "--strict-mcp-config"];
}

const BASE_ENV = ["HOME", "PATH", "USER", "LANG", "TMPDIR"];

function pickEnv(keys: string[], env: Record<string, string | undefined>) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = env[k];
    if (v) out[k] = v;
  }
  return out as NodeJS.ProcessEnv;
}

/** Only what the CLI needs to find its login; no database or API keys. */
export function briefingEnv(env: Record<string, string | undefined> = process.env) {
  return pickEnv(BASE_ENV, env);
}

/** As above, plus the credentials the writer needs. */
export function ingestEnv(env: Record<string, string | undefined> = process.env) {
  return pickEnv([...BASE_ENV, "SUPABASE_URL", "SUPABASE_SERVICE_KEY"], env);
}

export async function runBriefing(prompt: string): Promise<string> {
  const { stdout } = await pExecFile("claude", briefingArgs(prompt), {
    maxBuffer: MAX_BUFFER,
    timeout: 60_000,
    killSignal: "SIGKILL",
    cwd: tmpdir(),
    env: briefingEnv(),
  });
  return stdout;
}

export async function runIngest(source: IngestSource): Promise<void> {
  await pExecFile("claude", ingestArgs(source), {
    env: ingestEnv(),
    maxBuffer: MAX_BUFFER,
    timeout: 5 * 60_000,
    killSignal: "SIGKILL",
  });
}
