/**
 * Zero-touch setup for the bundled IMAP/SMTP Email skill on Windows+WSL:
 * merge .env allowlists, add workspace steering so the agent uses the CLI instead of refusing.
 */
import { platform, homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { readWslFile, writeWslFile, runInWsl } from './wsl-utils'
import { legacySlugDestDir, slugDestDir } from './skill-slug'

export const BUNDLED_EMAIL_SKILL_PATH_ID = 'Office Task/Email'

const WSL_IMAP_ENV = '/root/.config/imap-smtp-email/.env'
const WSL_WS = '/root/.openclaw/workspace'
const WSL_AGENTS = `${WSL_WS}/AGENTS.md`

const EMAIL_STEERING_V1_MARKER = '<!-- ENCHANTE_EMAIL_AGENT_STEERING_V1 -->'
const EMAIL_STEERING_V2_START = '<!-- ENCHANTE_EMAIL_AGENT_STEERING_V2 -->'
const EMAIL_STEERING_V2_END = '<!-- /ENCHANTE_EMAIL_AGENT_STEERING_V2 -->'

const V1_BLOCK_TAIL =
  'Đừng nói "hệ thống không gửi được email" nếu file cấu hình và thư mục skill còn tồn tại.'

const ALLOW_READ =
  'ALLOWED_READ_DIRS=~/.openclaw/workspace,~/.openclaw/workspace/skills'
const ALLOW_WRITE = 'ALLOWED_WRITE_DIRS=~/.openclaw/workspace'

/** Candidate folder names under workspace/skills (new slug, legacy slug, mistaken doc slug). */
export function emailSkillInstallSlugs(): string[] {
  const id = BUNDLED_EMAIL_SKILL_PATH_ID
  return [slugDestDir(id), legacySlugDestDir(id), 'Office--Task--Email']
}

function buildEmailSteeringBody(skillDirAbs: string): string {
  return `${EMAIL_STEERING_V2_START}

## Enchante — Bundled email skill (no terminal skills required for the user)

The app user is **not** a developer. **Do not** tell them to run shell commands themselves.

When they ask to **send email** or attach a file from the OpenClaw workspace:

1. **SMTP is configured** in \`~/.config/imap-smtp-email/.env\` (written by the Enchante wizard).
2. Run the Email skill CLI **for them** (you have exec/bash tools), from the installed skill folder:

\`\`\`bash
cd ${skillDirAbs} && node scripts/smtp.js send --to "RECIPIENT" --subject "SUBJECT" --body "BODY" 
# optional attachment (path must stay under ~/.openclaw/workspace):
# ... --attach /root/.openclaw/workspace/path/to/file.csv
\`\`\`

3. **Do not** claim you "cannot send email from OpenClaw" if that config file exists and the skill folder exists.
4. **Never** paste the user's SMTP password into chat.

---

## Enchante — Skill email đi kèm (người dùng không cần biết lệnh terminal)

Người dùng **không** phải lập trình viên. **Không** bảo họ tự gõ lệnh.

Khi họ muốn **gửi email** hoặc đính kèm file trong workspace OpenClaw: hãy **tự chạy** CLI skill Email (qua công cụ exec/bash) như trên. Đừng nói "hệ thống không gửi được email" nếu file cấu hình và thư mục skill còn tồn tại.

${EMAIL_STEERING_V2_END}
`
}

function stripEmailSteeringBlocks(content: string): string {
  let c = content.replace(/\r\n/g, '\n')
  // V2 (bounded)
  for (;;) {
    const a = c.indexOf(EMAIL_STEERING_V2_START)
    if (a < 0) break
    const b = c.indexOf(EMAIL_STEERING_V2_END, a)
    if (b < 0) {
      c = c.slice(0, a).trimEnd()
      break
    }
    const after = b + EMAIL_STEERING_V2_END.length
    c = `${c.slice(0, a).trimEnd()}\n${c.slice(after).replace(/^\s*\n+/, '')}`.trimEnd()
  }
  // V1 (unbounded legacy)
  for (;;) {
    const a = c.indexOf(EMAIL_STEERING_V1_MARKER)
    if (a < 0) break
    const tail = c.indexOf(V1_BLOCK_TAIL, a)
    if (tail < 0) {
      c = c.slice(0, a).trimEnd()
      break
    }
    const end = tail + V1_BLOCK_TAIL.length
    c = `${c.slice(0, a).trimEnd()}\n${c.slice(end).replace(/^\s*\n+/, '')}`.trimEnd()
  }
  return c
}

async function resolveWslEmailSkillDir(): Promise<string | null> {
  for (const slug of emailSkillInstallSlugs()) {
    const dir = `${WSL_WS}/skills/${slug}`
    try {
      const ok = await runInWsl(`test -d '${dir.replace(/'/g, "'\\''")}' && echo ok`, 8000)
      if (ok.includes('ok')) return dir
    } catch {
      /* try next */
    }
  }
  return null
}

function resolveNativeEmailSkillDir(): string | null {
  const base = join(homedir(), '.openclaw', 'workspace', 'skills')
  for (const slug of emailSkillInstallSlugs()) {
    const dir = join(base, slug)
    if (existsSync(dir)) return dir
  }
  return null
}

function mergeImapEnvContent(body: string): string {
  let out = body.replace(/\r\n/g, '\n')
  const hasRead = /^ALLOWED_READ_DIRS=/m.test(out)
  const readOk = /openclaw\/workspace/.test(out.match(/^ALLOWED_READ_DIRS=(.*)$/m)?.[1] ?? '')
  if (!hasRead) {
    out = out.trimEnd() + `\n${ALLOW_READ}\n`
  } else if (!readOk) {
    out = out.replace(/^ALLOWED_READ_DIRS=.*$/m, ALLOW_READ)
  }
  if (!/^ALLOWED_WRITE_DIRS=/m.test(out)) {
    out = out.trimEnd() + `\n${ALLOW_WRITE}\n`
  }
  return out.endsWith('\n') ? out : `${out}\n`
}

async function mergeImapEnvWsl(log?: (m: string) => void): Promise<boolean> {
  try {
    const raw = await readWslFile(WSL_IMAP_ENV)
    const next = mergeImapEnvContent(raw)
    await writeWslFile(WSL_IMAP_ENV, next)
    await runInWsl(`chmod 600 '${WSL_IMAP_ENV}'`, 8000)
    log?.('✓ ensured imap-smtp-email .env workspace allowlists')
    return true
  } catch {
    log?.('⚠ imap-smtp-email .env not found yet (complete Email skill in setup)')
    return false
  }
}

function mergeImapEnvDarwin(log?: (m: string) => void): boolean {
  const p = join(homedir(), '.config', 'imap-smtp-email', '.env')
  if (!existsSync(p)) return false
  try {
    const raw = readFileSync(p, 'utf-8')
    const next = mergeImapEnvContent(raw)
    writeFileSync(p, next, { mode: 0o600 })
    log?.('✓ ensured imap-smtp-email .env workspace allowlists (macOS)')
    return true
  } catch {
    return false
  }
}

async function writeAgentSteeringWsl(skillDirAbs: string, log?: (m: string) => void): Promise<void> {
  await runInWsl(`mkdir -p '${WSL_WS}'`, 10000)
  let current = ''
  try {
    current = await readWslFile(WSL_AGENTS)
  } catch {
    current = ''
  }
  const stripped = stripEmailSteeringBlocks(current)
  const body = buildEmailSteeringBody(skillDirAbs)
  const next = stripped.trim() ? `${stripped.trimEnd()}\n\n${body}\n` : `${body}\n`
  await writeWslFile(WSL_AGENTS, next.endsWith('\n') ? next : `${next}\n`)
  log?.(
    current.trim()
      ? '✓ updated workspace AGENTS.md (email steering v2)'
      : '✓ created workspace AGENTS.md (email steering v2)'
  )
}

function writeAgentSteeringNative(skillDirAbs: string, log?: (m: string) => void): void {
  const agentsPath = join(homedir(), '.openclaw', 'workspace', 'AGENTS.md')
  mkdirSync(dirname(agentsPath), { recursive: true })
  let cur = ''
  if (existsSync(agentsPath)) cur = readFileSync(agentsPath, 'utf-8')
  const stripped = stripEmailSteeringBlocks(cur)
  const body = buildEmailSteeringBody(skillDirAbs)
  const next = stripped.trim() ? `${stripped.trimEnd()}\n\n${body}\n` : `${body}\n`
  writeFileSync(agentsPath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8')
  log?.('✓ updated AGENTS.md (email steering v2)')
}

/**
 * After installing the Email skill (or on Done screen): fix legacy .env, steer the agent.
 */
export async function ensureBundledEmailSkillAutomation(log?: (m: string) => void): Promise<void> {
  if (platform() === 'win32') {
    const skillDir = await resolveWslEmailSkillDir()
    if (!skillDir) {
      log?.('⚠ email skill folder not found — skip automation')
      return
    }
    await mergeImapEnvWsl(log)
    await writeAgentSteeringWsl(skillDir, log)
  } else {
    const dest = resolveNativeEmailSkillDir()
    if (!dest) {
      log?.('⚠ email skill folder not found — skip automation')
      return
    }
    mergeImapEnvDarwin(log)
    try {
      writeAgentSteeringNative(dest, log)
    } catch {
      /* ignore */
    }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function sendBundledEmailTestWsl(to: string): Promise<{ ok: boolean; error?: string }> {
  if (platform() !== 'win32') return { ok: false, error: 'Only supported on Windows (WSL).' }
  const t = to.trim()
  if (!EMAIL_RE.test(t)) return { ok: false, error: 'Invalid email address.' }
  const skillDir = await resolveWslEmailSkillDir()
  if (!skillDir) {
    return { ok: false, error: 'Email skill is not installed in WSL workspace.' }
  }
  const q = skillDir.replace(/'/g, "'\\''")
  try {
    await runInWsl(`test -f '${q}/scripts/smtp.js' && echo ok`, 8000)
  } catch {
    return { ok: false, error: 'Email skill is not installed in WSL workspace.' }
  }
  const subj = 'OpenClaw (Enchante) — email test'
  const body =
    'This is an automatic test from the Enchante desktop app. If you received this, SMTP is configured correctly.'
  const cmd = `cd '${q}' && node scripts/smtp.js send --to '${t.replace(/'/g, "'\\''")}' --subject '${subj.replace(/'/g, "'\\''")}' --body '${body.replace(/'/g, "'\\''")}'`
  try {
    await runInWsl(cmd, 120000)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'Send failed' }
  }
}

export async function getBundledEmailSetupStatus(): Promise<{
  skillInstalled: boolean
  envExists: boolean
}> {
  if (platform() === 'win32') {
    try {
      const skillDir = await resolveWslEmailSkillDir()
      const e = await runInWsl(`test -f '${WSL_IMAP_ENV}' && echo env`, 8000)
      return { skillInstalled: !!skillDir, envExists: e.includes('env') }
    } catch {
      return { skillInstalled: false, envExists: false }
    }
  }
  const dest = resolveNativeEmailSkillDir()
  const env = join(homedir(), '.config', 'imap-smtp-email', '.env')
  return { skillInstalled: !!dest, envExists: existsSync(env) }
}
