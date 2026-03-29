// Fallback pinned version (used when remote check fails).
export const APPROVED_OPENCLAW_VERSION = '2026.3.23-2'
export const APPROVED_OPENCLAW_PACKAGE_SPEC = `openclaw@${APPROVED_OPENCLAW_VERSION}`

const RELEASE_REPO = process.env.OPENCLAW_RELEASES_REPO?.trim() || 'WalnutThinh/OpenClaw'
const RELEASE_VERSION_URL = process.env.OPENCLAW_RELEASE_VERSION_URL?.trim() || null
const VERSION_CACHE_TTL_MS = 5 * 60 * 1000

let cachedVersion: { value: string; at: number } | null = null

const normalizeVersionTag = (raw: string): string | null => {
  const v = raw.trim().replace(/^v/i, '')
  return v ? v : null
}

const fromRemoteVersionUrl = async (): Promise<string | null> => {
  if (!RELEASE_VERSION_URL) return null
  try {
    const r = await fetch(RELEASE_VERSION_URL, { method: 'GET', cache: 'no-store' })
    if (!r.ok) return null
    const txt = (await r.text()).trim()
    return normalizeVersionTag(txt)
  } catch {
    return null
  }
}

const fromGitHubLatestRelease = async (): Promise<string | null> => {
  try {
    const r = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!r.ok) return null
    const j = (await r.json()) as { tag_name?: string; name?: string }
    return normalizeVersionTag(j.tag_name ?? j.name ?? '')
  } catch {
    return null
  }
}

export const getApprovedOpenclawVersion = async (): Promise<string> => {
  const now = Date.now()
  if (cachedVersion && now - cachedVersion.at < VERSION_CACHE_TTL_MS) {
    return cachedVersion.value
  }
  const remote = (await fromRemoteVersionUrl()) ?? (await fromGitHubLatestRelease()) ?? APPROVED_OPENCLAW_VERSION
  cachedVersion = { value: remote, at: now }
  return remote
}

export const getApprovedOpenclawPackageSpec = async (): Promise<string> => {
  const v = await getApprovedOpenclawVersion()
  return `openclaw@${v}`
}

/**
 * CLI subcommand for `openclaw <name> --fix` (repair pass). The Enchante UI calls this **Fixer**;
 * upstream OpenClaw still uses this historical subcommand identifier.
 */
export const OPENCLAW_CLI_REPAIR_SUBCOMMAND = 'doctor'
