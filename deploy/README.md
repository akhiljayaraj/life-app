# Scheduled ingestion (macOS launchd)

Runs `npm run ingest calendar` every 6 hours.

First set `WorkingDirectory` in the plist to your checkout path.

Install:  `cp deploy/com.life-app.ingest.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.life-app.ingest.plist`
Run now:  `launchctl start com.life-app.ingest`
Logs:     `/tmp/life-app-ingest.log`, `/tmp/life-app-ingest.err`
Uninstall:`launchctl unload ~/Library/LaunchAgents/com.life-app.ingest.plist`

Requires:
- Claude Code logged in with your **Max subscription**, and `ANTHROPIC_API_KEY` **unset** in the launchd job's environment (otherwise `claude` bills the metered API and the Google connectors are disabled).
- The `google-calendar` MCP connector wired in `life-ingest/.mcp.json` (replace the placeholder).
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `VAULT_PATH` available to the job (see `.env.example`). launchd does not read `.env.local`; export them in your shell profile or add an `EnvironmentVariables` dict to the plist.
