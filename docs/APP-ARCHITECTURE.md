# OpenClaw Enchante — application architecture

This document replaces the old third-party marketing / tutorial docs. It describes how **this** repo is structured and how the wizard talks to OpenClaw.

---

## 1. Goals (from product conversations)

- **One-click for end users**: minimal terminal use; Windows path goes through **WSL Ubuntu** (`root`) for Node + `openclaw` CLI.
- **Pinned OpenClaw version**: single source in `src/main/services/openclaw-release.ts` (`APPROVED_OPENCLAW_VERSION`, `APPROVED_OPENCLAW_PACKAGE_SPEC`).
- **Chat channels**: Telegram, Zalo, Lark (Feishu in OpenClaw config) — selected in UI, written in onboarding.
- **Hooks step**: NemoClaw Shield toggle + logs; shield state in Electron `userData` via `app-settings.ts`.
- **Post-install UX**: smoke tests, runtime vs fixer-fix logs, copy logs; Done screen layout (smoke left / logs right) as implemented in renderer.
- **Windows installer**: user-chosen directory (`oneClick: false`), `build/installer.nsh` kills processes and clears stale uninstall registry keys to avoid “Retry / app running” loops.

---

## 2. High-level stack

| Layer | Tech |
|-------|------|
| Shell | Electron (electron-vite) |
| UI | React 19, Tailwind CSS 4 (`src/renderer/src/assets/main.css`) |
| Language | TypeScript (strict main/preload/web tsconfigs) |
| Package | electron-builder (`electron-builder.yml`), NSIS on Windows |

---

## 3. Process model (Electron)

```
┌─────────────┐     IPC      ┌──────────────┐
│  Renderer   │ ◄──────────► │ Main process │
│  (React)    │  preload API │ Node + OS    │
└─────────────┘              └──────────────┘
```

- **Main** (`src/main/index.ts`): window, tray, auto-update hooks, service orchestration.
- **Preload** (`src/preload/index.ts` + `index.d.ts`): only approved channels exposed as `window.electronAPI`.
- **Renderer**: wizard steps; no direct `require('electron')`.

**Rule:** adding a feature that crosses the boundary requires **three** edits: `ipc-handlers.ts`, `preload/index.ts`, `preload/index.d.ts`.

---

## 4. Wizard flow (renderer)

Defined in `src/renderer/src/hooks/useWizard.ts` (`STEPS` order):

1. `welcome` — `WelcomeStep.tsx`
2. `envCheck` — `EnvCheckStep.tsx` (may skip install if already OK)
3. `wslSetup` — **Windows only** when WSL not ready — `WslSetupStep.tsx`
4. `install` — `InstallStep.tsx` (Node + OpenClaw per platform)
5. `apiKeyGuide` — **Model & Provider**: provider, model, **provider API key** (or OAuth) — `ApiKeyGuideStep.tsx`  
   Models live in `src/renderer/src/constants/providers.ts`.
6. `appchatGuide` — **Model Chat**: tabs Zalo | Telegram | Lark (guide + tokens) — `AppchatGuideStep.tsx`
7. `hooks` — **Skills** (optional) + **NemoClaw Shield** — `HooksStep.tsx`
8. `config` — **Connect & apply**: summary + single `onboard.run` — `ConfigStep.tsx`
9. `done` — `DoneStep.tsx` (smoke test, open dashboard, troubleshoot)

**Out of linear flow:** `troubleshoot` — entered from Done; not in `STEPS` array; back uses history stack.

**State:** `App.tsx` holds provider, model, `providerApiKey`, chat tokens, `selectedSkills`, `enableNemoShield`, WSL/install flags, etc.; `ConfigStep` only reviews and runs onboarding.

---

## 5. Main services (`src/main/services/`)

| Module | Responsibility |
|--------|----------------|
| `openclaw-release.ts` | Pinned CLI version constants |
| `env-checker.ts` | Node / OpenClaw presence; compares to pinned version |
| `installer.ts` | Install Node + `npm install -g openclaw@<pinned>` (mac vs WSL) |
| `wsl-utils.ts` | WSL state, `runInWsl`, file helpers, `getWslIp`, `WSL_LINUX_PATH_PREFIX` (force Linux `npm`/`openclaw` — avoid `/mnt/c/...` plugin blocks) |
| `onboarder.ts` | Writes OpenClaw config, runs onboarding logic, Telegram/Zalo/Lark, skills (`npm exec` / `npx` with `--` so `--force` reaches `clawhub install`; stagger + retry on ClawHub rate limits). **Windows/WSL:** `openclaw onboard` uses `--skip-health` (gateway is started later by the app). `readSecurityStatus` |
| `app-settings.ts` | `userData/settings.json` (e.g. `nemoShieldEnabled`) |
| `gateway.ts` | Start/stop/status OpenClaw gateway; Windows port probe for 18789 |
| `smoke-tests.ts` | CLI version, port, channel probe, shield status |
| `troubleshooter.ts` | Fixer / repair (WSL bash wrapper, stderr hygiene for rm) |
| `tray-manager.ts` | Tray menu + gateway status polling |
| `updater.ts` | electron-updater |
| `uninstaller.ts` | Remove global OpenClaw + config paths |
| `oauth.ts` | OAuth helper flows where used |
| `path-utils.ts` | macOS PATH / binary resolution |
| `backup.ts` | Config backup/restore |

---

## 6. IPC surface (conceptual)

Handlers live in `src/main/ipc-handlers.ts`. Typical groups:

- **Environment / install:** `env:check`, install progress events, WSL install
- **Wizard persistence:** `wizard:save-state`, `wizard:load-state`, `wizard:clear-state` (reboot recovery)
- **Onboarding:** `onboard:run`, config read/switch provider
- **Gateway / dashboard:** start/stop/status, open URL
- **Troubleshooting:** fixer, fixer-fix
- **Smoke / security:** `smoke:run`, `security:status`, `security:set-nemo-shield` (if present)
- **Misc:** newsletter, language, uninstall, backup, etc.

Exact names are in preload typings.

---

## 7. Configuration files

| What | Where |
|------|--------|
| OpenClaw CLI config (Linux/WSL) | `/root/.openclaw/openclaw.json` (via onboarder) |
| App-only settings | `%APPDATA%`/… or macOS `Application Support`/… + `settings.json` |
| Builder / installer | `electron-builder.yml`, `build/installer.nsh` |
| Vercel static root | `docs/` (`vercel.json` → `outputDirectory: docs`) |

---

## 8. Shared constants

- `src/shared/chat-platforms.ts` — configurable platform ids and OpenClaw channel key mapping (e.g. Lark → `feishu`).

---

## 9. i18n

- Renderer: `src/shared/i18n/index.ts` + `locales/<lang>/*.json`
- Main (tray, etc.): `src/shared/i18n/main.ts`
- Supported languages configured in IPC + i18n resources (`en`, `ko`, `ja`, `zh`, `fr`, `vi`).

---

## 10. Build outputs

- **Windows:** `dist/OPENCLAW-setup.exe` (artifact name in `electron-builder.yml`)
- **macOS:** DMG name per `electron-builder.yml` / scripts  
- **Do not** build/install into the git checkout folder on Windows.

---

## 11. Related upstream docs

- OpenClaw project: <https://github.com/openclaw/openclaw>  
- Skills / fixer behavior follow upstream CLI; this app only automates install and common config paths.
