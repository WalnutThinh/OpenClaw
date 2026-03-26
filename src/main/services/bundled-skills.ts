import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  rmSync
} from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'
import { spawn } from 'child_process'
import { app } from 'electron'
import { runInWsl, readWslFile, writeWslFile } from './wsl-utils'
import {
  ensureBundledEmailSkillAutomation,
  BUNDLED_EMAIL_SKILL_PATH_ID
} from './email-skill-setup'
import {
  ensureBundledGoogleWorkspaceSteering,
  BUNDLED_GOOGLE_WORKSPACE_SKILL_PATH_ID
} from './google-workspace-skill-setup'
import { slugDestDir } from './skill-slug'

export { slugDestDir }

export interface BundledCredentialField {
  id: string
  labelKey: string
  type: 'text' | 'password'
}

export interface BundledEnchanteMeta {
  /** If true, omit from Additional skills wizard list */
  hiddenFromWizard?: boolean
  /** Short wizard subtitle (overrides auto summary from SKILL.md frontmatter) */
  wizardSummary?: string
  /** After copy on WSL, run `npm install --omit=dev` in the skill directory */
  npmInstall?: boolean
  credentialFields?: BundledCredentialField[]
  credentials?: {
    wslEnvPath: string
    /** Relative to homedir on macOS/Linux (e.g. `.config/foo/.env`) */
    darwinEnvPath?: string
    chmod600?: boolean
    lines: string[]
  }
  /** Raw Google service account key JSON → written to this path (field id `serviceAccountJson`). */
  serviceAccountJson?: {
    wslPath: string
    darwinPath?: string
    chmod600?: boolean
  }
}

export interface BundledSkillInfo {
  /** Relative path from skill root using forward slashes, e.g. `Office Task/Email` */
  id: string
  category: string
  name: string
  /** One-line hint from SKILL.md `description` (truncated); UI may override via i18n */
  summary: string
  credentialFields: BundledCredentialField[]
}

/** Windows absolute path → WSL /mnt/c/... */
export const windowsPathToWsl = (winAbs: string): string => {
  const norm = winAbs.replace(/\\/g, '/')
  const m = /^([A-Za-z]):\/(.*)$/.exec(norm)
  if (!m) return norm
  return `/mnt/${m[1].toLowerCase()}/${m[2]}`
}

export const getBundledSkillsRoot = (): string | null => {
  const packaged = join(process.resourcesPath, 'skill')
  if (existsSync(packaged)) return packaged
  const dev = join(app.getAppPath(), 'skill')
  if (existsSync(dev)) return dev
  return null
}

const SUMMARY_MAX_CHARS = 50

/** Collapse to max length (Unicode code points); add ellipsis if trimmed */
const truncateSummary = (text: string, max = SUMMARY_MAX_CHARS): string => {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const chars = [...t]
  if (chars.length <= max) return t
  if (max <= 1) return '…'
  return `${chars.slice(0, max - 1).join('')}…`
}

/**
 * Read YAML frontmatter `description` from SKILL.md (string, quoted, or `|` block).
 */
const extractDescriptionFromFrontmatter = (fmBody: string): string | null => {
  const lines = fmBody.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = /^description:\s*(.*)$/.exec(lines[i] ?? '')
    if (!m) continue
    let v = (m[1] ?? '').trim()
    if (v === '|' || v === '|>-' || v === '|>') {
      const buf: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const L = lines[j] ?? ''
        if (buf.length > 0 && /^[A-Za-z_][A-Za-z0-9_.]*:\s/.test(L)) break
        buf.push(L)
      }
      const joined = buf.join(' ').replace(/\s+/g, ' ').trim()
      return joined || null
    }
    if (v.startsWith('"')) {
      const line = lines[i] ?? ''
      const start = line.indexOf('"') + 1
      let out = ''
      let k = start
      while (k < line.length) {
        const c = line[k]!
        if (c === '\\' && k + 1 < line.length) {
          out += line[k + 1]!
          k += 2
          continue
        }
        if (c === '"') return out || null
        out += c
        k++
      }
      return out || null
    }
    if (v.startsWith("'")) {
      const line = lines[i] ?? ''
      const start = line.indexOf("'") + 1
      const end = line.lastIndexOf("'")
      if (end > start) return line.slice(start, end)
      return null
    }
    return v || null
  }
  return null
}

const readSkillSummaryFromMd = (skillMdPath: string): string => {
  try {
    const raw = readFileSync(skillMdPath, 'utf-8')
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw)
    if (!fm) return ''
    const desc = extractDescriptionFromFrontmatter(fm[1] ?? '')
    return desc ? truncateSummary(desc) : ''
  } catch {
    return ''
  }
}

const readSkillTitle = (skillMdPath: string): string | null => {
  try {
    const raw = readFileSync(skillMdPath, 'utf-8')
    const lines = raw.split(/\r?\n/)
    let i = 0
    if (lines[0]?.trim() === '---') {
      i = 1
      while (i < lines.length && lines[i]?.trim() !== '---') i++
      i++
    }
    for (; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? ''
      if (line.startsWith('# ')) return line.slice(2).trim()
      if (line.length > 0 && !line.startsWith('---')) break
    }
  } catch {
    /* ignore */
  }
  return null
}

const readEnchanteMeta = (skillDir: string): BundledEnchanteMeta | null => {
  const p = join(skillDir, '_enchante.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as BundledEnchanteMeta
  } catch {
    return null
  }
}

function walkSkillDirs(root: string, rel = ''): string[] {
  const out: string[] = []
  const dir = rel ? join(root, rel) : root
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  const hasSkill = entries.includes('SKILL.md')
  if (hasSkill) {
    out.push(rel || '.')
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const sub = rel ? `${rel}/${name}` : name
    const full = join(root, sub)
    try {
      if (statSync(full).isDirectory()) out.push(...walkSkillDirs(root, sub))
    } catch {
      /* skip */
    }
  }
  return out
}

/** Group skills by first path segment (category). `.` → category from folder name not used — single segment uses that name as category. */
export const listBundledSkills = (): BundledSkillInfo[] => {
  const root = getBundledSkillsRoot()
  if (!root) return []
  const relDirs = walkSkillDirs(root).filter((r) => r !== '.')
  const infos: BundledSkillInfo[] = []
  for (const rel of relDirs) {
    const skillDir = join(root, rel)
    const md = join(skillDir, 'SKILL.md')
    if (!existsSync(md)) continue
    const parts = rel.split(/[/\\]/)
    const category = parts.length > 1 ? parts[0]! : parts[0]!
    const baseName = parts[parts.length - 1]!
    const title = readSkillTitle(md)
    const meta = readEnchanteMeta(skillDir)
    if (meta?.hiddenFromWizard) continue
    const name = title || baseName
    const fromMeta = meta?.wizardSummary?.trim()
    const summary = fromMeta ? truncateSummary(fromMeta) : readSkillSummaryFromMd(md)
    infos.push({
      id: rel.replace(/\\/g, '/'),
      category,
      name,
      summary,
      credentialFields: meta?.credentialFields ?? []
    })
  }
  return infos.sort((a, b) => a.id.localeCompare(b.id))
}

const BUNDLED_SKILLS_INDEX_START = '<!-- ENCHANTE_BUNDLED_SKILLS_INDEX_V1 -->'
const BUNDLED_SKILLS_INDEX_END = '<!-- /ENCHANTE_BUNDLED_SKILLS_INDEX_V1 -->'

function readSkillFrontmatterName(skillMdPath: string): string | null {
  try {
    const raw = readFileSync(skillMdPath, 'utf-8')
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw)
    if (!fm) return null
    const body = fm[1] ?? ''
    const m = /^name:\s*(.+)$/m.exec(body)
    if (!m) return null
    let v = (m[1] ?? '').trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    return v || null
  } catch {
    return null
  }
}

/**
 * Append/replace a short inventory so the agent knows which Enchante bundled folders exist
 * (OpenClaw may snapshot skills at session start; this also helps when metadata keys differ).
 */
async function syncBundledSkillsAgentsIndex(
  selections: { id: string }[],
  log: (msg: string) => void
): Promise<void> {
  if (selections.length === 0) return
  const root = getBundledSkillsRoot()
  if (!root) return

  const lines: string[] = [
    BUNDLED_SKILLS_INDEX_START,
    '',
    '## Enchante — Bundled skills in this workspace',
    '',
    'These folders exist under `~/.openclaw/workspace/skills/` (WSL path `/root/.openclaw/workspace/skills/`).',
    'When the user asks what skills are installed, include these alongside ClawHub skills.',
    ''
  ]

  for (const sel of selections) {
    const srcLocal = join(root, ...sel.id.split('/'))
    const md = join(srcLocal, 'SKILL.md')
    const folder = slugDestDir(sel.id)
    const fmName = readSkillFrontmatterName(md)
    const label = fmName ? `**${fmName}**` : '`SKILL.md`'
    lines.push(`- \`${folder}\` — ${label} (source id: \`${sel.id.replace(/`/g, "'")}\`)`)
  }
  lines.push('')
  lines.push(BUNDLED_SKILLS_INDEX_END)
  lines.push('')

  const block = `${lines.join('\n').trimEnd()}\n`

  const isWin = platform() === 'win32'
  if (isWin) {
    const agentsPath = '/root/.openclaw/workspace/AGENTS.md'
    await runInWsl(`mkdir -p '/root/.openclaw/workspace'`, 10000)
    let current = ''
    try {
      current = await readWslFile(agentsPath)
    } catch {
      current = ''
    }
    const stripped = stripBundledSkillsIndexBlock(current)
    const next = stripped.trim() ? `${stripped.trimEnd()}\n\n${block}` : block
    await writeWslFile(agentsPath, next.endsWith('\n') ? next : `${next}\n`)
    log('✓ updated workspace AGENTS.md (bundled skills inventory)')
  } else {
    const agentsPath = join(homedir(), '.openclaw', 'workspace', 'AGENTS.md')
    mkdirSync(dirname(agentsPath), { recursive: true })
    let current = ''
    if (existsSync(agentsPath)) current = readFileSync(agentsPath, 'utf-8')
    const stripped = stripBundledSkillsIndexBlock(current)
    const next = stripped.trim() ? `${stripped.trimEnd()}\n\n${block}` : block
    writeFileSync(agentsPath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8')
    log('✓ updated workspace AGENTS.md (bundled skills inventory)')
  }
}

function stripBundledSkillsIndexBlock(content: string): string {
  const start = content.indexOf(BUNDLED_SKILLS_INDEX_START)
  if (start < 0) return content
  const end = content.indexOf(BUNDLED_SKILLS_INDEX_END, start)
  if (end < 0) {
    return content.slice(0, start).trimEnd()
  }
  const after = end + BUNDLED_SKILLS_INDEX_END.length
  return `${content.slice(0, start).trimEnd()}\n${content.slice(after).replace(/^\s*\n+/, '')}`.trimEnd()
}

function isValidGoogleServiceAccountJson(raw: string): boolean {
  try {
    const o = JSON.parse(raw) as { type?: string; client_email?: string; private_key?: string }
    return (
      o?.type === 'service_account' &&
      typeof o.client_email === 'string' &&
      typeof o.private_key === 'string' &&
      o.private_key.length > 0
    )
  } catch {
    return false
  }
}

const shellQuoteWslPath = (p: string): string => p.replace(/'/g, "'\\''")

/**
 * Copy bundled skill into OpenClaw workspace skills dir and optional credential files.
 */
export const installBundledSkillSelections = async (
  selections: { id: string; credentials: Record<string, string> }[],
  log: (msg: string) => void
): Promise<void> => {
  if (selections.length === 0) return
  const root = getBundledSkillsRoot()
  if (!root) {
    log('⚠ bundled skills: skill folder not found in app resources')
    return
  }

  const isWin = platform() === 'win32'

  for (const sel of selections) {
    const srcLocal = join(root, ...sel.id.split('/'))
    if (!existsSync(join(srcLocal, 'SKILL.md'))) {
      log(`⚠ bundled skill missing: ${sel.id}`)
      continue
    }

    const meta = readEnchanteMeta(srcLocal)
    const fields = meta?.credentialFields ?? []
    for (const f of fields) {
      if (!sel.credentials[f.id]?.trim()) {
        log(`⚠ ${sel.id}: missing ${f.id} — skip credentials file`)
      }
    }

    const destName = slugDestDir(sel.id)
    log(`📦 Installing bundled skill: ${sel.id}`)

    if (isWin) {
      const wslSrc = windowsPathToWsl(srcLocal)
      const dest = `/root/.openclaw/workspace/skills/${destName}`
      await runInWsl(
        `mkdir -p /root/.openclaw/workspace/skills && rm -rf '${dest}' && cp -a '${wslSrc}' '${dest}'`,
        120000
      )
      if (meta?.npmInstall) {
        await runInWsl(`cd '${dest}' && npm install --omit=dev`, 300000)
        log(`✓ npm install --omit=dev in ${dest}`)
      }
      if (meta?.credentials?.lines?.length && meta.credentials.wslEnvPath) {
        const missing = fields.some((f) => !sel.credentials[f.id]?.trim())
        if (!missing) {
          let body = meta.credentials.lines.join('\n')
          for (const [k, v] of Object.entries(sel.credentials)) {
            body = body.split(`{{${k}}}`).join(v.replace(/[\r\n]/g, ''))
          }
          const envDir = dirname(meta.credentials.wslEnvPath)
          await runInWsl(`mkdir -p '${envDir}'`, 15000)
          await writeWslFile(meta.credentials.wslEnvPath, `${body}\n`)
          if (meta.credentials.chmod600) {
            await runInWsl(`chmod 600 '${meta.credentials.wslEnvPath}'`, 10000)
          }
          log(`✓ Wrote ${meta.credentials.wslEnvPath}`)
        }
      }
      const saCfg = meta?.serviceAccountJson
      const saBody = sel.credentials.serviceAccountJson?.trim()
      if (saCfg?.wslPath && saBody) {
        if (!isValidGoogleServiceAccountJson(saBody)) {
          log(`⚠ ${sel.id}: invalid service account JSON — skip key file`)
        } else {
          const d = shellQuoteWslPath(dirname(saCfg.wslPath))
          const f = shellQuoteWslPath(saCfg.wslPath)
          await runInWsl(`mkdir -p '${d}'`, 15000)
          await writeWslFile(saCfg.wslPath, `${saBody}\n`)
          if (saCfg.chmod600 !== false) {
            await runInWsl(`chmod 600 '${f}'`, 10000)
          }
          log(`✓ Wrote ${saCfg.wslPath}`)
        }
      }
    } else {
      const wsSkills = join(homedir(), '.openclaw', 'workspace', 'skills')
      const dest = join(wsSkills, destName)
      mkdirSync(wsSkills, { recursive: true })
      try {
        rmSync(dest, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
      cpSync(srcLocal, dest, { recursive: true })
      if (meta?.npmInstall) {
        await new Promise<void>((resolve, reject) => {
          const child = spawn('npm', ['install', '--omit=dev'], { cwd: dest, stdio: 'ignore' })
          child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`npm exit ${code}`))))
          child.on('error', reject)
        })
        log(`✓ npm install --omit=dev in ${dest}`)
      }
      if (meta?.credentials?.lines?.length) {
        const relEnv =
          meta.credentials.darwinEnvPath ?? '.config/imap-smtp-email/.env'
        const envPath = join(homedir(), relEnv.replace(/^\//, ''))
        const missing = fields.some((f) => !sel.credentials[f.id]?.trim())
        if (!missing) {
          mkdirSync(dirname(envPath), { recursive: true })
          let body = meta.credentials.lines.join('\n')
          for (const [k, v] of Object.entries(sel.credentials)) {
            body = body.split(`{{${k}}}`).join(v.replace(/[\r\n]/g, ''))
          }
          writeFileSync(envPath, `${body}\n`, { mode: 0o600 })
          log(`✓ Wrote ${envPath}`)
        }
      }
      const saCfg = meta?.serviceAccountJson
      const saBody = sel.credentials.serviceAccountJson?.trim()
      if (saCfg && saBody) {
        const rel = saCfg.darwinPath ?? '.config/openclaw-google-workspace/service-account.json'
        if (!isValidGoogleServiceAccountJson(saBody)) {
          log(`⚠ ${sel.id}: invalid service account JSON — skip key file`)
        } else {
          const saPath = join(homedir(), rel.replace(/^\//, ''))
          mkdirSync(dirname(saPath), { recursive: true })
          writeFileSync(saPath, `${saBody}\n`, { mode: 0o600 })
          log(`✓ Wrote ${saPath}`)
        }
      }
    }
  }

  try {
    await syncBundledSkillsAgentsIndex(selections, log)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`⚠ bundled skills AGENTS.md index: ${msg}`)
  }

  if (selections.some((s) => s.id === BUNDLED_EMAIL_SKILL_PATH_ID)) {
    try {
      await ensureBundledEmailSkillAutomation(log)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`⚠ email skill automation: ${msg}`)
    }
  }

  if (selections.some((s) => s.id === BUNDLED_GOOGLE_WORKSPACE_SKILL_PATH_ID)) {
    try {
      await ensureBundledGoogleWorkspaceSteering(log)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`⚠ Google Workspace steering: ${msg}`)
    }
  }
}

/**
 * Rewrite only the bundled Email skill `.env` (WSL or macOS/Linux homedir).
 * Used when the user fixes Gmail App Password after the first Save — without re-running full onboard.
 */
export const applyBundledEmailCredentials = async (
  credentials: Record<string, string>,
  log: (msg: string) => void = (): void => {}
): Promise<{ ok: boolean; error?: string }> => {
  const root = getBundledSkillsRoot()
  if (!root) {
    return { ok: false, error: 'Bundled skills folder not found' }
  }
  const srcLocal = join(root, ...BUNDLED_EMAIL_SKILL_PATH_ID.split('/'))
  if (!existsSync(join(srcLocal, 'SKILL.md'))) {
    return { ok: false, error: 'Bundled Email skill not found' }
  }
  const meta = readEnchanteMeta(srcLocal)
  const fields = meta?.credentialFields ?? []
  if (!meta?.credentials?.lines?.length || !meta.credentials.wslEnvPath) {
    return { ok: false, error: 'Email skill has no credential template' }
  }
  for (const f of fields) {
    if (!credentials[f.id]?.trim()) {
      return { ok: false, error: `Missing ${f.id}` }
    }
  }

  const isWin = platform() === 'win32'
  try {
    if (isWin) {
      let body = meta.credentials.lines.join('\n')
      for (const [k, v] of Object.entries(credentials)) {
        body = body.split(`{{${k}}}`).join(v.replace(/[\r\n]/g, ''))
      }
      const envDir = dirname(meta.credentials.wslEnvPath)
      await runInWsl(`mkdir -p '${envDir}'`, 15000)
      await writeWslFile(meta.credentials.wslEnvPath, `${body}\n`)
      if (meta.credentials.chmod600) {
        await runInWsl(`chmod 600 '${meta.credentials.wslEnvPath}'`, 10000)
      }
      log(`✓ Updated ${meta.credentials.wslEnvPath}`)
    } else {
      const relEnv = meta.credentials.darwinEnvPath ?? '.config/imap-smtp-email/.env'
      const envPath = join(homedir(), relEnv.replace(/^\//, ''))
      mkdirSync(dirname(envPath), { recursive: true })
      let body = meta.credentials.lines.join('\n')
      for (const [k, v] of Object.entries(credentials)) {
        body = body.split(`{{${k}}}`).join(v.replace(/[\r\n]/g, ''))
      }
      writeFileSync(envPath, `${body}\n`, { mode: 0o600 })
      log(`✓ Updated ${envPath}`)
    }
    await ensureBundledEmailSkillAutomation(log)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
