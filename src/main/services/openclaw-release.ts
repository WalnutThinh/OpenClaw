// Pinned OpenClaw release approved for Nemo Claw / Enchante app v1.1.01.
// Upstream: https://github.com/openclaw/openclaw — keep in sync with tested npm releases.
export const APPROVED_OPENCLAW_VERSION = '2026.3.23-2'
export const APPROVED_OPENCLAW_PACKAGE_SPEC = `openclaw@${APPROVED_OPENCLAW_VERSION}`

/**
 * CLI subcommand for `openclaw <name> --fix` (repair pass). The Enchante UI calls this **Fixer**;
 * upstream OpenClaw still uses this historical subcommand identifier.
 */
export const OPENCLAW_CLI_REPAIR_SUBCOMMAND = 'doctor'
