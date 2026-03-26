# Reading OpenClaw logs on Windows + WSL

This doc helps interpret common log lines **without** asking end users to read upstream docs.

## 1. Skill install: `Rate limit exceeded (remaining: 0/20)`

- **Meaning:** The **ClawHub registry** limits how many install requests per minute.
- **Not a failed install** if the next line shows retry then `OK. Installed`.
- **In Enchante:** We space out installs (~4s) and **retry with backoff** so most runs succeed automatically.

## 2. `Gateway did not become reachable` / `1006` (older runs)

- **Meaning:** `openclaw onboard` tried to talk to a gateway that was not running yet.
- **Fix in app:** On Windows/WSL we pass **`--skip-health`** during onboard; the app starts the gateway later.

## 3. `blocked plugin candidate: world-writable path (/mnt/c/.../npm/node_modules/openclaw/extensions/...)`

- **Root cause:** `npm` / `openclaw` was resolved from **Windows** (`C:\Users\...\AppData\Roaming\npm`), which in WSL is mounted as **`/mnt/c/...`**. On NTFS, directories often appear as permission **`777`**, and OpenClaw **refuses to load plugins** from “world-writable” paths (security).
- **Symptoms:** Many extensions blocked, `telegram` blocked, `memory slot plugin not found`, gateway service path mismatch vs Linux install under `/usr/lib/node_modules/...`.
- **Fix in Enchante:** All WSL commands that run `npm`, `npx`, or `openclaw` now prefix **`PATH`** with Linux-only directories (`/usr/bin`, …) so the **Ubuntu-installed** OpenClaw is used, not the Windows copy.

## 4. `Gateway service entrypoint does not match the current install`

- **Meaning:** A **stale service definition** points at one `openclaw` binary, while the running install is elsewhere (often after mixing Windows + Linux npm).
- **Usually improves after:** Running with the **Linux-only PATH** fix + the OpenClaw repair pass (`openclaw … --fix`; Enchante labels this **Fixer** in the UI — the upstream CLI subcommand name is still the historical one) when starting the gateway on Windows.

## 5. Memory / embeddings warnings (`No API key for provider "openai"`, etc.)

- **Meaning:** **Semantic memory search** wants an **embedding** API key (OpenAI, Google, Voyage, …), separate from the chat model key.
- **Fix in Enchante (defaults):** We set `agents.defaults.memorySearch.enabled` to **`false`** in the generated config so first-time setup does not spam errors. Users can enable memory later inside OpenClaw when they add embedding credentials.

## 6. `tools.profile ... unknown entries (apply_patch, cron)`

- **Meaning:** Harmless **profile vs runtime** mismatch warning; not the reason chat fails.

## 7. Zalo: `Cannot find module ... net.js` / `getZaloRuntime`

See **[CHANNELS-ZALO-UPSTREAM.md](CHANNELS-ZALO-UPSTREAM.md)** — bug inside the OpenClaw Zalo extension for the installed CLI version, not Enchante wizard config.

## 8. Browser: `ERR_CONNECTION_REFUSED` / WS `1006` / `unauthorized` / `device_token_mismatch`

See **[OPENCLAW-DASHBOARD.md](OPENCLAW-DASHBOARD.md)** — aligns with [OpenClaw dashboard docs](https://docs.openclaw.ai/web/dashboard): gateway must be running; Control UI auth uses `gateway.auth.token`; Enchante opens `#token=` when the token is plain text in config.

## 9. Fixer “Security” box: `Zalo DMs: locked` / `pairing`

- **Not an install failure.** The **Fixer** (repair pass) prints a **security audit** reminder: with `dmPolicy="pairing"`, new Zalo users must be approved before the bot replies.
- **Channels tab** in Enchante may show `[zalo]` lines plus this panel — compare with **OpenClaw** tab (gateway core). See **[CHANNELS-ZALO-UPSTREAM.md](CHANNELS-ZALO-UPSTREAM.md)** for pairing vs Control UI.

---

For maintainers: `WSL_LINUX_PATH_PREFIX` lives in `src/main/services/wsl-utils.ts` and is prepended to WSL `bash -lc` invocations that touch `npm` / `openclaw`.
