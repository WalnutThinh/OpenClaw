# Product principles — OpenClaw Enchante

## Audience

Enchante exists so people who **do not write code** can run OpenClaw on **macOS or Windows** without becoming terminal users.

- **User responsibility:** install the app, complete the wizard, use the assistant (Control UI, Telegram, Zalo, etc.).
- **Not user responsibility:** memorizing `wsl`, `openclaw pairing …`, `npm`, or shell paths — unless we have failed to package something and are tracking **technical debt**.

## One packaged application

Everything that can run locally should be **driven from Enchante**:

- Start/stop/restart gateway  
- Run repair/fix flows  
- Open dashboard with auth  
- Surface logs in the UI  
- **Shipped / ongoing:** Zalo pairing approval from the **Done** screen (no terminal); more channel health and structured errors over time  

Raw OpenClaw CLI remains available **inside the environment we manage** (e.g. WSL); the **app** must orchestrate it via **main process + IPC**, not by instructing the user to open a terminal.

## Testing and errors before “go live”

Where feasible:

1. **Probe** gateway and critical channels after install or before the Done step (automated checks, not manual commands).
2. **Parse** logs / exit codes and **classify** problems.
3. **Software defects** → fix in this repo, release an update.
4. **User or external service issues** (payment, invalid API key, firewall blocking localhost, Zalo OA misconfiguration) → **in-app message** with **short, non-technical** next steps; optional “Details” for power users or support.

## Why this is a rule, not only a preference

If our answer to “Zalo doesn’t reply” is only “run these commands in PowerShell,” we have **outsourced the product** to the user. Enchante’s job is to **absorb that complexity** over time.

Developer docs (`docs/*.md`) may still show CLI for debugging parity with **upstream OpenClaw**; that is **not** the default end-user experience.

## Cursor / AI

Project rule: **`.cursor/rules/enchante-user-first.mdc`** (`alwaysApply: true`). Implementations and copy should align with this document.
