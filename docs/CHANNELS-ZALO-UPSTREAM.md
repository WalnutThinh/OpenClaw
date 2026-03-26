# Zalo channel errors (OpenClaw upstream)

**Note:** The Fixer “Security” / pairing lines in logs are **policy reminders**, not failed setup — see **[OPENCLAW-WSL-LOGS.md §9](OPENCLAW-WSL-LOGS.md)**. **ClawHub “Rate limit”** during skill install is covered in **[OPENCLAW-WSL-LOGS.md §1](OPENCLAW-WSL-LOGS.md)**.

Logs like the following come from the **OpenClaw** package installed in WSL (`/usr/lib/node_modules/openclaw/`), not from the Enchante Electron app:

```text
Cannot find module '../../../src/gateway/net.js'
Require stack: .../openclaw/extensions/zalo/src/monitor.webhook.ts

Cannot read properties of undefined (reading 'getZaloRuntime')
```

## Meaning

- The **Zalo extension** ships `monitor.webhook.ts` with a **dev-only import** (`../../../src/gateway/net.js`) that **does not exist** in the published npm tree (e.g. `openclaw@2026.3.23-2`). The second error (`getZaloRuntime`) often follows from that failed load.
- Upstream should import `resolveClientIp` from a published entry such as **`openclaw/plugin-sdk/mattermost`** (same as the Mattermost extension).

## What Enchante does

- **Automatic patch (idempotent):** Before starting the gateway (and before the Troubleshoot “Fixer” run), Enchante rewrites the bad import in the **global** OpenClaw install (`$(npm root -g)/openclaw/extensions/zalo/src/monitor.webhook.ts`) when the exact broken line is still present. Log line: `gateway.zaloPatchApplied`.
- Pins a tested CLI version in `src/main/services/openclaw-release.ts` (`APPROVED_OPENCLAW_VERSION`).
- When upstream publishes a fix, **bump that version** after QA and reinstall OpenClaw in WSL (`npm install -g openclaw@…`). After upgrade, the patch may **skip** if the file no longer contains the old import.

## What users can try (outside the app)

1. **Update OpenClaw in WSL** after a new release is announced:
   ```bash
   wsl -d Ubuntu -u root -- npm install -g openclaw@latest
   ```
   (Only if your team approves versions newer than the pinned one.)

2. **Report / track** the issue on the **OpenClaw** project (extension `zalo`), including the exact version from `openclaw --version`.

3. **Workaround:** use **Telegram** (or another channel) until Zalo is fixed in the CLI version you run.

## Doctor / Fixer output still “complete”

The repair pass can finish with **“Doctor complete”** while a **channel worker** crashes in a loop — gateway health and Zalo runtime are separate subsystems.

## Control UI works on localhost but Zalo does not reply

Check these in order:

### 1. Pairing (DM policy)

If Fixer shows **Zalo DMs: locked** with **`dmPolicy="pairing"`**, unknown senders must be approved before the bot can talk to them.

**In Enchante:** during **Config** (when Zalo is enabled), after you **Save configuration**, use the **Authentication** block: paste the **latest** code from the bot reply and tap **Approve**, or **Refresh pending list** — no terminal required.

Developers / manual CLI (same as above):

```bash
wsl -d Ubuntu -u root -- bash -lc 'openclaw pairing list zalo'
wsl -d Ubuntu -u root -- bash -lc 'openclaw pairing approve zalo <CODE_FROM_YOUR_ZALO_CHAT>'
```

Until you approve, **no** Zalo DM will reach the agent (this is **not** a Zalo API bug).

### 2. Same model for every channel — check provider / billing

**Web UI and Zalo use the same gateway and the same agent model.** If the LLM call fails, **every** channel is affected.

In the gateway log, look for lines like:

```text
[agent/embedded] ... error=... billing error ... deepseek ...
```

or **insufficient balance / credits**. Fix by topping up **DeepSeek** (or whichever provider you use), or switching **provider / API key / model** in OpenClaw config, then restart the gateway.

**Symptom pattern:** Control UI shows “connected” but new messages get **no assistant reply** or errors; Zalo stays silent for the same reason — **not** because Zalo is misconfigured.

### 3. Zalo line shows “Zalo: ok”

If logs show **`[zalo] ... Zalo polling loop started`** and **`Zalo: ok`** from Fixer, the Zalo **plugin** is up; the next place to look is **pairing** (above) and **LLM provider** (above).

### 4. Tokens and secrets

Do **not** paste bot tokens or API keys into public chats. If you did, **rotate** the token in the Zalo developer console and update `~/.openclaw/openclaw.json` (WSL path on Windows).

### 5. Topped up the LLM account but the bot still does not reply

Credits apply to the **API key** that DeepSeek (or your provider) shows in their dashboard. OpenClaw may still be using an **old key**, a **different project**, or the gateway may need a **restart** to clear errors.

1. **Confirm which key OpenClaw uses** (WSL as root, same as Enchante):
   ```bash
   wsl -d Ubuntu -u root -- bash -lc 'openclaw config get agents.defaults.model 2>/dev/null; openclaw config get gateway 2>/dev/null | head -5'
   ```
   Match the **API key** in `~/.openclaw/openclaw.json` (or env) to the **same** DeepSeek account you funded. If you created a **new** key after paying, paste it into config and save.

2. **Restart the gateway** after any config or billing change (Enchante: Stop Gateway → Start Gateway, or restart the app).

3. **Send one test message from Control UI** (`http://127.0.0.1:18789/chat`).  
   - If **UI gets no reply** either, tail the log while sending and read the **latest** `[agent/embedded]` error (not only old lines):
     ```bash
     wsl -d Ubuntu -u root -- bash -lc 'openclaw logs --tail 80'
     ```
   - If **UI works** but **Zalo does not**, the model is fine — focus on **pairing** (§1) and Zalo token/webhook (upstream).

4. **Still seeing `billing error` after payment** — wait a few minutes for provider billing to sync; try **regenerating** the API key in the provider console and updating OpenClaw config.
