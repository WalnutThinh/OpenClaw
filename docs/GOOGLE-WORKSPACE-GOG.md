# Google Workspace (Sheets, Docs, Gmail…) — skill **gog**

Enchante bundles the ClawHub skill **jx76-gog** (folder `skill/Office Task/Google Workspace/`). It is **documentation only**: you install the **`gog`** CLI and run OAuth on your machine (usually WSL, same environment as OpenClaw).

## Difference vs IMAP Email skill

- **Email (IMAP/SMTP)** wizard fields = mailbox login for the bundled Node mailer.
- **Google Sheets/Docs/Drive** via **gog** = OAuth with Google Cloud **OAuth client** JSON + `gog auth` — not the same passwords.

## Setup outline

1. Google Cloud Console: project, enable APIs (Sheets, Drive, Docs, Gmail… as needed), create **OAuth 2.0 Desktop** client, download `client_secret….json`.
2. In WSL: install `gog` ([gogcli.sh](https://gogcli.sh)).
3. Run:
   - `gog auth credentials /path/to/client_secret.json`
   - `gog auth add you@gmail.com --services gmail,calendar,drive,contacts,sheets,docs`
4. Ensure the **`gog`** binary is on `PATH` where the OpenClaw agent runs, or the skill may be filtered out by `requires.bins`.

## Gmail SMTP test error 534 / App Password

If you use the **IMAP/SMTP** skill with Gmail and see **“Application-specific password required”**, enable a Google **App password** (Account → Security) and paste that into the wizard password field — not your normal Google password.
