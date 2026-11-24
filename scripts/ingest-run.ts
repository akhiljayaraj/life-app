import { spawnSync } from "node:child_process";
import { ingestArgs, isIngestSource } from "../lib/claude";

const source = process.argv[2] ?? "all";
if (!isIngestSource(source)) {
  console.error(`unsupported source: ${source}`);
  process.exit(1);
}
const r = spawnSync("claude", ingestArgs(source), { stdio: "inherit" });
process.exit(r.status ?? 1);
