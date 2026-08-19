import { spawnSync } from "node:child_process";

const source = process.argv[2] ?? "all";
const r = spawnSync("claude", ["-p", `/ingest ${source}`], { stdio: "inherit" });
process.exit(r.status ?? 1);
