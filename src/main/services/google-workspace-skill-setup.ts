/**
 * After the wizard writes a Google service account JSON key, add workspace steering so the agent
 * knows where credentials live and how they relate to gog / Workspace APIs.
 */
import { homedir, platform } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { readWslFile, writeWslFile, runInWsl } from './wsl-utils'
import { slugDestDir } from './skill-slug'

export const BUNDLED_GOOGLE_WORKSPACE_SKILL_PATH_ID = 'Office Task/Google Workspace'

/** Service account JSON path inside WSL (Ubuntu, root) — must match `_enchante.json` / bundled install */
export const GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL =
  '/root/.config/openclaw-google-workspace/service-account.json'

const WSL_WS = '/root/.openclaw/workspace'
const WSL_AGENTS = `${WSL_WS}/AGENTS.md`

const GW_STEERING_START = '<!-- ENCHANTE_GOOGLE_WORKSPACE_STEERING_V1 -->'
const GW_STEERING_END = '<!-- /ENCHANTE_GOOGLE_WORKSPACE_STEERING_V1 -->'

function stripGoogleWorkspaceSteering(content: string): string {
  let c = content.replace(/\r\n/g, '\n')
  for (;;) {
    const a = c.indexOf(GW_STEERING_START)
    if (a < 0) break
    const b = c.indexOf(GW_STEERING_END, a)
    if (b < 0) {
      c = c.slice(0, a).trimEnd()
      break
    }
    const after = b + GW_STEERING_END.length
    c = `${c.slice(0, a).trimEnd()}\n${c.slice(after).replace(/^\s*\n+/, '')}`.trimEnd()
  }
  return c
}

function buildSteeringBody(skillDirAbs: string, saPathDisplay: string): string {
  return `${GW_STEERING_START}

## Enchante — Google Workspace (bundled skill)

1. **Service account key (wizard):** JSON credentials are stored at \`${saPathDisplay}\` (chmod 600). For **Google Drive / Docs / Sheets** file access, share those files or folders with the service account **client_email** from that JSON (Viewer or Editor as needed).
2. **gog CLI (optional):** The bundled skill documents **gog** for Gmail, Calendar, etc. via **OAuth** (\`gog auth …\`). That is separate from the service account file; use whichever flow matches the task.
3. **Drive/Docs/Sheets APIs (service account):** Enchante starts the OpenClaw gateway with \`GOOGLE_APPLICATION_CREDENTIALS\` pointing at this JSON when the file exists, so agent tools and scripts using Google client libraries can authenticate. You must still **share** relevant Drive files with the service account \`client_email\`. If the bot says credentials are missing, **restart the gateway** from the app (or Done step) after saving Config.

Skill directory: \`${skillDirAbs}\`

${GW_STEERING_END}
`
}

async function resolveWslGoogleWorkspaceSkillDir(): Promise<string | null> {
  const slug = slugDestDir(BUNDLED_GOOGLE_WORKSPACE_SKILL_PATH_ID)
  const dir = `${WSL_WS}/skills/${slug}`
  try {
    const ok = await runInWsl(`test -d '${dir.replace(/'/g, "'\\''")}' && echo ok`, 8000)
    if (ok.trim() === 'ok') return dir
  } catch {
    /* ignore */
  }
  return null
}

function resolveNativeGoogleWorkspaceSkillDir(): string | null {
  const slug = slugDestDir(BUNDLED_GOOGLE_WORKSPACE_SKILL_PATH_ID)
  const dir = join(homedir(), '.openclaw', 'workspace', 'skills', slug)
  return existsSync(dir) ? dir : null
}

async function writeGoogleWorkspaceSteeringWsl(
  skillDir: string,
  log: (msg: string) => void
): Promise<void> {
  let current = ''
  try {
    current = await readWslFile(WSL_AGENTS)
  } catch {
    current = ''
  }
  const stripped = stripGoogleWorkspaceSteering(current)
  const block = buildSteeringBody(skillDir, GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL)
  const next = stripped.trim() ? `${stripped.trimEnd()}\n\n${block}` : block
  await writeWslFile(WSL_AGENTS, next.endsWith('\n') ? next : `${next}\n`)
  log('✓ updated workspace AGENTS.md (Google Workspace steering)')
}

function writeGoogleWorkspaceSteeringNative(skillDir: string, log: (msg: string) => void): void {
  const agentsPath = join(homedir(), '.openclaw', 'workspace', 'AGENTS.md')
  const saDisplay = join(homedir(), '.config', 'openclaw-google-workspace', 'service-account.json')
  mkdirSync(dirname(agentsPath), { recursive: true })
  let cur = ''
  if (existsSync(agentsPath)) cur = readFileSync(agentsPath, 'utf-8')
  const stripped = stripGoogleWorkspaceSteering(cur)
  const block = buildSteeringBody(skillDir, saDisplay)
  const next = stripped.trim() ? `${stripped.trimEnd()}\n\n${block}` : block
  writeFileSync(agentsPath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8')
  log('✓ updated AGENTS.md (Google Workspace steering)')
}

export async function ensureBundledGoogleWorkspaceSteering(log: (msg: string) => void): Promise<void> {
  if (platform() === 'win32') {
    const skillDir = await resolveWslGoogleWorkspaceSkillDir()
    if (!skillDir) {
      log('⚠ Google Workspace skill folder not found in WSL — skip AGENTS.md steering')
      return
    }
    await runInWsl(`mkdir -p '${WSL_WS}'`, 10000)
    await writeGoogleWorkspaceSteeringWsl(skillDir, log)
  } else {
    const skillDir = resolveNativeGoogleWorkspaceSkillDir()
    if (!skillDir) {
      log('⚠ Google Workspace skill folder not found — skip AGENTS.md steering')
      return
    }
    writeGoogleWorkspaceSteeringNative(skillDir, log)
  }
}

export async function applyBundledGoogleWorkspaceServiceAccountJson(
  jsonBody: string,
  log: (msg: string) => void = (): void => {}
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = jsonBody.trim()
  if (!trimmed) return { ok: false, error: 'Empty JSON' }
  let parsed: { type?: string; client_email?: string; private_key?: string }
  try {
    parsed = JSON.parse(trimmed) as { type?: string; client_email?: string; private_key?: string }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
  if (
    parsed.type !== 'service_account' ||
    typeof parsed.client_email !== 'string' ||
    typeof parsed.private_key !== 'string'
  ) {
    return { ok: false, error: 'Not a service account key (expected type service_account)' }
  }

  const isWin = platform() === 'win32'
  try {
    if (isWin) {
      const dir = dirname(GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL)
      await runInWsl(`mkdir -p '${dir.replace(/'/g, "'\\''")}'`, 15000)
      await writeWslFile(GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL, `${trimmed}\n`)
      await runInWsl(
        `chmod 600 '${GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL.replace(/'/g, "'\\''")}'`,
        10000
      )
      log(`✓ Updated ${GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL}`)
    } else {
      const rel = '.config/openclaw-google-workspace/service-account.json'
      const path = join(homedir(), rel)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, `${trimmed}\n`, { mode: 0o600 })
      log(`✓ Updated ${path}`)
    }
    await ensureBundledGoogleWorkspaceSteering(log)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

const bashSingleQuote = (s: string): string => s.replace(/'/g, "'\\''")

/**
 * Prefix for `bash -lc` under WSL: export GOOGLE_APPLICATION_CREDENTIALS when the wizard key file exists.
 * OpenClaw gateway / agent children inherit this environment.
 */
export function wslBashSnippetExportGoogleApplicationCredentialsIfKeyExists(): string {
  const p = bashSingleQuote(GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_WSL)
  return `[ -f '${p}' ] && export GOOGLE_APPLICATION_CREDENTIALS='${p}' || true`
}

export function nativeGoogleWorkspaceServiceAccountJsonPath(): string {
  return join(homedir(), '.config', 'openclaw-google-workspace', 'service-account.json')
}

export function mergeProcessEnvWithGoogleWorkspaceCredentials(
  base: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const p = nativeGoogleWorkspaceServiceAccountJsonPath()
  if (!existsSync(p)) return base
  return { ...base, GOOGLE_APPLICATION_CREDENTIALS: p }
}
