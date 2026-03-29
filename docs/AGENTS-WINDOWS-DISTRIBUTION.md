# Windows distribution rules (for agents & maintainers)

Use this when implementing releases, CI, or explaining how **OPENCLAW-setup.exe** + the **app zip** are published. Keeps costs on **free tiers** (Cloudflare Pages + GitHub Releases).

## Architecture (two artifacts)

| Artifact | Role | Typical host | Size |
|----------|------|--------------|------|
| **`OPENCLAW-setup.exe`** | Bootstrapper: UI + downloads zip + extracts. Contains embedded `install-manifest.json` with `appZipUrl`. | **Cloudflare Pages** — e.g. `https://enchante.cloud/downloads/OPENCLAW-setup.exe` | ~100–180 MB |
| **`OpenClaw-*-win.zip`** | Full packaged app from `npm run build:win-app-zip`. | **GitHub Release assets** (not raw git commits) | Large (hundreds of MB) |

**Do not** store large zips in git history or Git LFS for this flow. **Attach** the zip to a **GitHub Release**.

## Version & naming (single policy)

- App semver / display rules: **`docs/RELEASE-VERSIONING-GUIDE.md`** (standard **`x.y.z`**, bump root `package.json` `version`).
- The Windows app zip name comes from **electron-builder** + root `package.json` `version` + `productName` (`OpenClaw`), e.g. **`OpenClaw-1.1.2-win.zip`** (or legacy `*-win32-x64.zip` if present).  
  **Always** use the **actual filename** produced in `dist/` after `build:win-app-zip`.

## Build: bake the zip URL into the installer

The bootstrapper does **not** embed the zip; it downloads at install time from `appZipUrl`.

1. Produce app zip: `npm run build:win-app-zip` → `dist/OpenClaw-…-win.zip`.
2. Publish that zip as a **GitHub Release** asset (same repo you use for releases; name should match what you will put in the URL).
3. Build the small setup with a **full HTTPS URL** to that asset, e.g.:
   ```bash
   set OPENCLAW_APP_ZIP_URL=https://github.com/OWNER/REPO/releases/download/v1.1.2/OpenClaw-1.1.2-win.zip
   npm run build:win-setup
   ```
   The segment after `download/` must be your **actual GitHub tag** (e.g. if the release is tagged `v1.1.02` but the zip is named `OpenClaw-1.1.2-win.zip`, use `v1.1.02` in the URL — see **`docs/RELEASE-VERSIONING-GUIDE.md`** §5).
   Or from PowerShell: `$env:OPENCLAW_APP_ZIP_URL="..."; npm run build:win-setup`
4. Output: **`dist/installer/OPENCLAW-setup.exe`**.

Script reference: **`scripts/build-windows-bootstrapper.mjs`**.  
If **`OPENCLAW_APP_ZIP_URL`** is unset, the script writes `appZipUrl` as `OPENCLAW_APP_ZIP_BASE_URL` + basename of the zip in `dist/` (default base `https://enchante.cloud/downloads/` — only viable if that file is actually served there and within host limits).

## Publish checklist (recommended free-tier layout)

1. Bump **`package.json`** `version` per **RELEASE-VERSIONING-GUIDE.md**.
2. `npm run build:win-app-zip` → confirm **`dist/OpenClaw-*-win.zip`**.
3. Create **GitHub Release** (tag aligned with policy) → upload **that zip** as an asset.
4. Set **`OPENCLAW_APP_ZIP_URL`** to the **direct download** URL of the asset → `npm run build:win-setup`.
5. Upload **`dist/installer/OPENCLAW-setup.exe`** to **Cloudflare Pages** (e.g. sync into `enchante.cloud/public/downloads/` and deploy).
6. Optional: `npm run sync-to-enchante-site` from repo root if `enchante.cloud` is sibling and policy includes copying the setup (zip sync is optional if zip is only on GitHub).

## Agent reminders

- **New `appZipUrl` is baked into each new `.exe`.** Users who keep an old setup binary still point at the old URL until they download a new setup (unless you intentionally use one stable URL and overwrite the file at that URL — advanced).
- **Install-time requires network** to fetch the zip (except local dev: `setup-bootstrapper/payload/openclaw-app.zip`).
- **Cloudflare Pages** file-size limits: hosting **only** the small setup is intentional; the **zip** stays on **GitHub Releases** (or R2 later if needed).
- Main implementation: **`setup-bootstrapper/`** (download + extract + `install-manifest.json` in **extraResources**).

## Related docs

- **`docs/BUILD-WINDOWS.md`** — local build, Defender, locks.
- **`docs/RELEASE-VERSIONING-GUIDE.md`** — version scheme and release checklist.
- **`docs/APP-ARCHITECTURE.md`** — high-level artifact pointers.
