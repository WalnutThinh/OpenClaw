# Windows distribution rules (for agents & maintainers)

Use this when implementing releases, CI, or explaining how **OPENCLAW-setup.exe** + the **app zip** are published. Keeps costs on **free tiers** (Cloudflare Pages + GitHub Releases).

## Architecture (launcher + latest.json)

| Artifact | Role | Typical host | Size |
|----------|------|--------------|------|
| **`OPENCLAW-setup.exe`** | Bootstrapper/launcher: UI → fetch `latest.json` → download zip (resume) → checksum verify → extract. | **Cloudflare Pages** — e.g. `https://enchante.cloud/downloads/OPENCLAW-setup.exe` | ~100–180 MB |
| **`latest.json`** | Release pointer + integrity (`url`, `sha256`, `size`, `version`). | **R2/Pages static URL** (stable) | tiny |
| **`EClaw-*-win.zip`** (legacy: `OpenClaw-*-win.zip`) | Full packaged app. | **R2** (recommended) or GitHub Release assets | Large (GB-class) |

**Do not** store large zips in git history or Git LFS for this flow. **Attach** the zip to a **GitHub Release**.

## Version & naming (single policy)

- App semver / display rules: **`docs/RELEASE-VERSIONING-GUIDE.md`** (standard **`x.y.z`**, bump root `package.json` `version`).
- The Windows app zip name comes from **electron-builder** + root `package.json` `version` + `productName` (**`EClaw`**), e.g. **`EClaw-1.1.2-win.zip`** (or legacy `*-win32-x64.zip` if present).  
  **Always** use the **actual filename** produced in `dist/` after `build:win-app-zip`.

## Build: bake `latest.json` URL into the installer

The bootstrapper does **not** embed the zip; it fetches `latest.json` then downloads the zip pointed by `latest.json.url`.

1. Produce app zip + metadata: `npm run build:win-app-zip:latest` → `dist/EClaw-…-win.zip` + `dist/latest.json`.
2. Upload zip to R2 (or GitHub Release), then update/upload `latest.json` so `url` points to the uploaded zip and `sha256` matches.
3. Build the small setup with stable latest.json URL, e.g.:
   ```bash
   set OPENCLAW_LATEST_JSON_URL=https://enchante.cloud/downloads/latest.json
   npm run build:win-setup
   ```
   Or from PowerShell: `$env:OPENCLAW_LATEST_JSON_URL="..."; npm run build:win-setup`
4. Output: **`dist/installer/OPENCLAW-setup.exe`**.

Script reference: **`scripts/build-windows-bootstrapper.mjs`**.  
If `OPENCLAW_LATEST_JSON_URL` is unset, default is `https://enchante.cloud/downloads/latest.json`.

## Publish checklist (recommended free-tier layout)

1. Bump **`package.json`** `version` per **RELEASE-VERSIONING-GUIDE.md**.
2. `npm run build:win-app-zip:latest` → confirm **`dist/EClaw-*-win.zip`** + `dist/latest.json`.
3. Upload zip to R2 (`aws s3 cp` with R2 endpoint).
4. Upload/update `latest.json` to the stable URL.
5. `set OPENCLAW_LATEST_JSON_URL=https://.../latest.json && npm run build:win-setup`.
6. Upload **`dist/installer/OPENCLAW-setup.exe`** to website/download host.

One-command pipeline (app zip + latest.json + setup.exe):

```bash
S3_BUCKET=download S3_PREFIX=downloads S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com \
OPENCLAW_LATEST_BASE_URL=https://enchante.cloud/downloads \
npm run publish:e2e-s3
```

## Agent reminders

- **New `latestJsonUrl` is baked into each new `.exe`.** Keep this URL stable and only update `latest.json` content per release.
- **Install-time requires network** to fetch the zip (except local dev: `setup-bootstrapper/payload/openclaw-app.zip`).
- **Cloudflare Pages** file-size limits: hosting **only** the small setup is intentional; the **zip** stays on **GitHub Releases** (or R2 later if needed).
- Main implementation: **`setup-bootstrapper/`** (download + extract + `install-manifest.json` in **extraResources**).

## GitHub Releases: branding EClaw vs repo name `OpenClaw`

- **Release title / description:** edit on the GitHub release page anytime (e.g. “EClaw 1.1.2”) — no tag change required.
- **Zip asset filename:** ship **`EClaw-<semver>-win.zip`** from `npm run build:win-app-zip`; remove or replace older **`OpenClaw-*-win.zip`** on that release. **`appZipUrl`** / `OPENCLAW_APP_ZIP_URL` must match the **exact** asset name (or use `github-release-asset://OWNER/REPO/EClaw-1.1.2-win.zip`).
- **Repository slug** (e.g. `WalnutThinh/OpenClaw`): optional rename in GitHub repo settings; if renamed, update every **`github.com/…`** and **`github-release-asset://…`** path. The bootstrapper only cares that **owner/repo + asset name** resolve to a real download.

## Related docs

- **`docs/BUILD-WINDOWS.md`** — local build, Defender, locks.
- **`docs/RELEASE-VERSIONING-GUIDE.md`** — version scheme and release checklist.
- **`docs/APP-ARCHITECTURE.md`** — high-level artifact pointers.
