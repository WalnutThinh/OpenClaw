# OpenClaw Enchante Versioning Guide

This document defines a single source of truth for release versioning and update flow.

## 1) App & Windows zip: semver `x.y.z`

The **desktop app** and **Windows zip** name follow **standard npm semver** (three numeric segments):

- Examples: `1.1.0`, `1.1.1`, `1.1.2`, `1.2.0`
- **Do not** use a leading zero in the patch segment (use **`1.1.2`**, not `1.1.02`) so `package.json`, GitHub tags, and **`OpenClaw-1.1.2-win.zip`** stay aligned with electron-builder.

Progression:

1. Patch fix: bump **z** (`1.1.2` → `1.1.3`)
2. Minor feature line: bump **y**, reset **z** (`1.1.x` → `1.2.0`)
3. Major: bump **x**

## 2) Update Strategy (OpenClaw CLI)

Latest **CLI** version is resolved in this order:

1. `OPENCLAW_RELEASE_VERSION_URL` (recommended; deterministic source of truth)
2. GitHub latest release tag from repo (default: `WalnutThinh/OpenClaw`)
3. Fallback pinned version in code (`APPROVED_OPENCLAW_VERSION` in `openclaw-release.ts`)

CLI tags may use a different scheme (e.g. calendar-based); that is independent of the **app** semver above.

## 3) Release Checklist (Every New Update)

### A. If releasing a new **App** version

1. Bump root `package.json` → `version` (e.g. `1.1.2`)
2. Bump `setup-bootstrapper/package.json` → same `version` (keeps bootstrapper in sync)
3. Build and test installer
4. Publish installer and update download URL source if needed  
   **Windows two-file flow (setup on Pages, zip on GitHub Releases):** see **`docs/AGENTS-WINDOWS-DISTRIBUTION.md`**.
5. Verify app startup + wizard + update UI

### B. If releasing a new **OpenClaw CLI** version

1. Publish release/tag per your CLI policy
2. If using version endpoint, update it
3. Verify Env step shows `Update Available` on an older installed CLI
4. Click update button in Env and confirm CLI updates successfully
5. Keep fallback pinned version in `openclaw-release.ts` reasonably recent

## 4) Required Verification Before Shipping

1. Env step:
   - installed old CLI → update banner appears
   - installed latest CLI → no false-positive update
2. Install step:
   - installs correct OpenClaw package spec
3. WSL path (Windows):
   - Node, OpenClaw, Python checks behave correctly
4. Update flow:
   - update succeeds without manual terminal usage

## 5) Quick Troubleshooting

- Update not showing:
  - check remote source reachable (`OPENCLAW_RELEASE_VERSION_URL` or GitHub API)
  - check repo/tag format and network availability
- Wrong version installed:
  - verify resolved package spec from `getApprovedOpenclawPackageSpec()`
- Windows install **HTTP 404** on zip:
  - The path segment after `download/` is the **GitHub release tag** (e.g. `v1.1.02`), not always identical to `package.json` if you once tagged with a leading zero in the patch.
  - The **filename** must match the uploaded asset (usually **`OpenClaw-<semver from package.json>-win.zip`**, e.g. `OpenClaw-1.1.2-win.zip`).
  - Example that works for the current `WalnutThinh/OpenClaw` release: tag **`v1.1.02`**, file **`OpenClaw-1.1.2-win.zip`** →  
    `https://github.com/WalnutThinh/OpenClaw/releases/download/v1.1.02/OpenClaw-1.1.2-win.zip`  
    Using **`v1.1.2`** in that URL returns **404** because no release exists at that tag.
  - Verify with: `curl -sI "<your appZipUrl>"` (expect **302** from `github.com`).
  - The bootstrapper and `build-windows-bootstrapper.mjs` **auto-correct** the mistaken URL ending in `.../v1.1.02/OpenClaw-1.1.02-win.zip` to use **`OpenClaw-1.1.2-win.zip`** (the asset that actually exists on that release).

## 6) Notes for Future Maintainers

- **App** semver: **`x.y.z`** only; aligns with electron-builder `${version}` in `electron-builder.yml`.
- Prefer explicit version endpoint (`OPENCLAW_RELEASE_VERSION_URL`) for CLI rollout when applicable.
- **Windows shipping (bootstrapper + hosted zip):** **`docs/AGENTS-WINDOWS-DISTRIBUTION.md`**.
- Keep this file updated whenever version source logic changes.
