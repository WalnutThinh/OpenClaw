# OpenClaw Enchante Versioning Guide

This document defines a single source of truth for release versioning and update flow.

## 1) Unified Version Scheme (Single Policy)

Use one unified format for both:

- **App version (installer/UI)**
- **OpenClaw CLI release line shown in update flow**

Format:

- `x.x.xx`

Version progression rules:

1. `x.x.01` = first update in the current minor line
2. `x.x.02` = small fix / patch in the same line
3. `x.(n+1).01` (or `x.(n+1).xx`) = bigger update that moves to next minor line

Examples:

- `1.1.01` -> first release in line `1.1`
- `1.1.02` -> small fix on top of `1.1.01`
- `1.2.01` -> larger update from `1.1.xx` to `1.2.xx`

## 2) Update Strategy

Latest version is resolved in this order:

1. `OPENCLAW_RELEASE_VERSION_URL` (recommended; deterministic source of truth)
2. GitHub latest release tag from repo (default: `WalnutThinh/OpenClaw`)
3. Fallback pinned version in code (`APPROVED_OPENCLAW_VERSION`)

All sources should publish version values in unified format `x.x.xx`.

## 3) Release Checklist (Every New Update)

### A. If releasing a new **App** version

1. Bump `package.json` -> `version` (e.g. `1.1.02`)
2. Build and test installer
3. Publish installer and update download URL source if needed  
   **Windows two-file flow (setup on Pages, zip on GitHub Releases):** see **`docs/AGENTS-WINDOWS-DISTRIBUTION.md`**.
4. Verify app startup + wizard + update UI

### B. If releasing a new **OpenClaw CLI** version

1. Publish release/tag using unified format `x.x.xx`
2. If using version endpoint, update it to the same value
3. Verify Env step shows `Update Available` on an older installed CLI
4. Click update button in Env and confirm CLI updates successfully
5. Keep fallback pinned version in `openclaw-release.ts` reasonably recent

## 4) Required Verification Before Shipping

1. Env step:
   - installed old CLI -> update banner appears
   - installed latest CLI -> no false-positive update
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
- App/CLI version confusion:
  - both lines follow the same `x.x.xx` style
  - patch fix = bump last segment (`xx`)
  - bigger update = bump minor segment and restart patch from `01`

## 6) Notes for Future Maintainers

- Keep version naming unified as `x.x.xx` across app + CLI release communication.
- Prefer explicit version endpoint (`OPENCLAW_RELEASE_VERSION_URL`) for deterministic rollout.
- **Windows shipping (bootstrapper + hosted zip):** **`docs/AGENTS-WINDOWS-DISTRIBUTION.md`**.
- Keep this file updated whenever version source logic changes.

