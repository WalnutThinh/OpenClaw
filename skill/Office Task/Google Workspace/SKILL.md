---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.
homepage: https://gogcli.sh
tags: ["google", "gmail", "calendar", "drive", "sheets", "docs", "productivity", "workspace"]
metadata: {"openclaw":{"emoji":"🎮","requires":{"bins":["gog"]}}}
---

# Google Workspace (gog)

Use the **`gog`** CLI for Gmail, Calendar, Drive, Contacts, **Google Sheets**, and **Google Docs** via OAuth (not IMAP passwords).

## OpenClaw / Enchante (WSL)

1. Install **`gog`** inside the same Linux environment as OpenClaw (e.g. Ubuntu on WSL). Official install options: [gogcli.sh](https://gogcli.sh) (Homebrew on Linux, or follow upstream releases for your distro).
2. From a shell in that environment, run OAuth setup once:
   - `gog auth credentials /path/to/client_secret.json` (OAuth client JSON from Google Cloud Console)
   - `gog auth add you@gmail.com --services gmail,calendar,drive,contacts,sheets,docs`
   - `gog auth list`
3. Optional: `export GOG_ACCOUNT=you@gmail.com` (or set in the agent environment) so you omit `--account`.

This bundled folder only ships **documentation**; the `gog` binary and OAuth tokens live on the machine after you run the commands above.

## Common commands

- Gmail search: `gog gmail search 'newer_than:7d' --max 10`
- Gmail send: `gog gmail send --to a@b.com --subject "Hi" --body "Hello"`
- Calendar: `gog calendar events <calendarId> --from <iso> --to <iso>`
- Drive search: `gog drive search "query" --max 10`
- Contacts: `gog contacts list --max 20`
- Sheets get: `gog sheets get <sheetId> "Tab!A1:D10" --json`
- Sheets update: `gog sheets update <sheetId> "Tab!A1:B2" --values-json '[["A","B"],["1","2"]]' --input USER_ENTERED`
- Sheets append: `gog sheets append <sheetId> "Tab!A:C" --values-json '[["x","y","z"]]' --insert INSERT_ROWS`
- Sheets clear: `gog sheets clear <sheetId> "Tab!A2:Z"`
- Sheets metadata: `gog sheets metadata <sheetId> --json`
- Docs export: `gog docs export <docId> --format txt --out /tmp/doc.txt`
- Docs cat: `gog docs cat <docId>`

## Notes

- For scripting with the agent, prefer `--json` and `--no-input`.
- Docs: export/cat/copy are supported; rich in-place editing needs the Docs API outside `gog`.
- Confirm before sending mail or creating calendar events.
