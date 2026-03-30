// Fallback pinned version (used when remote check fails). Must match a version published on npm.
export const APPROVED_OPENCLAW_VERSION = '2026.3.28'
export const APPROVED_OPENCLAW_PACKAGE_SPEC = `openclaw@${APPROVED_OPENCLAW_VERSION}`

const RELEASE_REPO = process.env.OPENCLAW_RELEASES_REPO?.trim() || 'WalnutThinh/OpenClaw'
const RELEASE_VERSION_URL = process.env.OPENCLAW_RELEASE_VERSION_URL?.trim() || null
const VERSION_CACHE_TTL_MS = 5 * 60 * 1000

let cachedVersion: { value: string; at: number } | null = null

const normalizeVersionTag = (raw: string): string | null => {
  const v = raw.trim().replace(/^v/i, '')
  return v ? v : null
}

/** The `openclaw` package on npm uses calendar-style versions (e.g. 2026.3.28), not desktop app semver (1.1.2). */
const isNpmOpenclawVersion = (v: string): boolean => /^\d{4}\.\d+\.\d+(-\d+)?$/.test(v.trim())

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

const fromNpmLatestOpenclaw = async (): Promise<string | null> => {
  try {
    const r = await fetch('https://registry.npmjs.org/openclaw/latest', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    if (!r.ok) return null
    const j = (await r.json()) as { version?: string }
    const v = typeof j.version === 'string' ? j.version.trim() : ''
    return v && isNpmOpenclawVersion(v) ? v : null
  } catch {
    return null
  }
}

export const getApprovedOpenclawVersion = async (): Promise<string> => {
  const now = Date.now()
  if (cachedVersion && now - cachedVersion.at < VERSION_CACHE_TTL_MS) {
    return cachedVersion.value
  }
  const urlRaw = await fromRemoteVersionUrl()
  const urlOk = urlRaw && isNpmOpenclawVersion(urlRaw) ? urlRaw : null
  const npmV = await fromNpmLatestOpenclaw()
  const ghRaw = await fromGitHubLatestRelease()
  const ghOk = ghRaw && isNpmOpenclawVersion(ghRaw) ? ghRaw : null
  const remote = urlOk ?? npmV ?? ghOk ?? APPROVED_OPENCLAW_VERSION
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
