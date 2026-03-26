# OpenClaw Control UI (Dashboard) & Enchante

Official reference: **[Dashboard (Control UI)](https://docs.openclaw.ai/web/dashboard)**.

## What goes wrong in the browser

| Symptom | Typical cause |
|--------|----------------|
| `ERR_CONNECTION_REFUSED` / `127.0.0.1 refused to connect` | **Gateway not listening** on `127.0.0.1:18789` (process stopped, still starting, or crash). |
| WebSocket `disconnected (1006)` / `no reason` | Often follows **refused connection** or abrupt gateway shutdown — fix gateway first. |
| Connects for a few seconds, then **SIGTERM** in logs and **1006** | Something **stopped or restarted** the gateway (e.g. `openclaw doctor --fix` while the gateway was already running). **Enchante** runs automated repair **before** starting `openclaw gateway run` on Windows/macOS so the dashboard is not killed right after connect. |
| **`gateway already running` / port 18789 in use** then **Gateway Stopped** in the app | **Fixer** may have started the **supervised** gateway (`openclaw-gateway` / systemd). Enchante runs a stronger **`openclaw gateway stop`** + **`systemctl stop`** + **`pkill openclaw-gateway`**, then waits for the port. If **`openclaw gateway run`** still exits with “already running” but something is listening, the app **adopts** that listener (same Control UI). **Status** uses **Windows TCP + WSL `/dev/tcp` probe** so “port closed” on Windows does not wrongly show Stopped when only WSL listens. **Done step** calls **`gateway:ensure-ready`** (start + one automatic retry) so users don’t have to open Troubleshoot first. |
| `unauthorized` / `device_token_mismatch` (code 1008) | **Auth drift**: Control UI WebSocket expects `gateway.auth.token` (or device token flow). Stale session in the browser vs current gateway token. |

## How OpenClaw expects auth to work

- Control UI loads at **`http://127.0.0.1:18789/`** (or `localhost`).
- WebSocket handshake uses **`connect.params.auth`** (token or password) — see `gateway.auth` in [Gateway configuration](https://docs.openclaw.ai/gateway/configuration).
- Token source: **`gateway.auth.token`** or **`OPENCLAW_GATEWAY_TOKEN`**.
- CLI can print/open links: `openclaw dashboard` (may use URL **fragment** `#token=...` for one-time bootstrap; UI stores session in **sessionStorage** for the tab).

## What Enchante does

1. **`dashboard:open` IPC** (`src/main/services/openclaw-dashboard.ts`):
   - Ensures **Gateway status is `running`** before opening the browser (avoids useless `ERR_CONNECTION_REFUSED` when nothing listens).
   - Reads **`gateway.auth.token`** from `~/.openclaw/openclaw.json` (WSL path on Windows).
   - If the token is a **plain string**, opens:  
     `http://127.0.0.1:18789/#token=<encoded>`  
     (same pattern as OpenClaw’s own `openclaw dashboard` / control-ui bootstrap — hash, not query).
   - If the token is **SecretRef** or missing, opens the **base URL** only; user must paste token in Control UI **Settings** (per upstream docs).

2. **Done step** shows a short **`dashboardHelp`** line (i18n) pointing to official docs and `openclaw config get gateway.auth.token` on the gateway host (e.g. WSL).

## Manual recovery (WSL / Linux)

```bash
# Is gateway up?
openclaw status

# Get token for pasting into Control UI Settings
openclaw config get gateway.auth.token

# Regenerate if needed (see upstream doctor docs)
openclaw doctor --generate-gateway-token
```

## See also

- [CHANNELS-ZALO-UPSTREAM.md](CHANNELS-ZALO-UPSTREAM.md) — Zalo channel errors vs gateway UI.
- [OPENCLAW-WSL-LOGS.md](OPENCLAW-WSL-LOGS.md) — WSL / gateway logs.
