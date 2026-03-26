import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import https from 'https'
import { BrowserWindow } from 'electron'
import {
  checkWslState,
  runInWsl,
  runInWslWithLog,
  buildWslPathOnlyPrefix,
  WSL_STATE_ORDER,
  type WslState
} from './wsl-utils'
import { getPathEnv } from './path-utils'
import { APPROVED_OPENCLAW_PACKAGE_SPEC } from './openclaw-release'
import { t } from '../../shared/i18n/main'
import { splitInstallProgressMessages } from '../../shared/install-log-format'
import {
  bashSingleQuotedWslPath,
  buildOllamaSystemdDropInBase64,
  getResolvedOllamaModelsWslPath
} from './ollama-models-path'

type ProgressCallback = (msg: string) => void

interface RunError extends Error {
  lines?: string[]
}

const sendProgress = (win: BrowserWindow, msg: string): void => {
  try {
    for (const line of splitInstallProgressMessages(msg)) {
      win.webContents.send('install:progress', line)
    }
  } catch {
    /* window destroyed */
  }
}

const downloadFile = (url: string, dest: string, maxRedirects = 5): Promise<void> =>
  new Promise((resolve, reject) => {
    let redirectCount = 0
    const follow = (u: string): void => {
      https
        .get(u, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume()
            if (++redirectCount > maxRedirects) {
              reject(new Error('Too many redirects'))
              return
            }
            follow(res.headers.location)
            return
          }
          if (!res.statusCode || res.statusCode >= 400) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const file = createWriteStream(dest)
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
          file.on('error', reject)
        })
        .on('error', reject)
    }
    follow(url)
  })

const streamSpawnLines = (
  decoder: StringDecoder,
  carry: { buf: string },
  chunk: Buffer,
  emit: (line: string) => void
): void => {
  carry.buf += decoder.write(chunk)
  let nl: number
  while ((nl = carry.buf.indexOf('\n')) >= 0) {
    const line = carry.buf.slice(0, nl).replace(/\r$/, '')
    carry.buf = carry.buf.slice(nl + 1)
    if (line.length) emit(line)
  }
}

const flushSpawnCarry = (
  decoder: StringDecoder,
  carry: { buf: string },
  emit: (line: string) => void
): void => {
  carry.buf += decoder.end()
  const rest = carry.buf.replace(/\r$/, '').trimEnd()
  carry.buf = ''
  if (rest.length) emit(rest)
}

const runWithLog = (
  cmd: string,
  args: string[],
  onLog: ProgressCallback,
  options?: { shell?: boolean; env?: NodeJS.ProcessEnv; cwd?: string }
): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      shell: options?.shell ?? false,
      env: options?.env ?? process.env,
      cwd: options?.cwd
    })

    const lines: string[] = []
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    const outCarry = { buf: '' }
    const errCarry = { buf: '' }
    const emit = (l: string): void => {
      onLog(l)
      lines.push(l)
    }
    child.stdout.on('data', (d) => streamSpawnLines(outDecoder, outCarry, d as Buffer, emit))
    child.stderr.on('data', (d) => streamSpawnLines(errDecoder, errCarry, d as Buffer, emit))
    child.on('close', (code) => {
      flushSpawnCarry(outDecoder, outCarry, emit)
      flushSpawnCarry(errDecoder, errCarry, emit)
      if (code === 0) resolve(lines)
      else {
        const err: RunError = new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${code})`)
        err.lines = lines
        reject(err)
      }
    })
    child.on('error', reject)
  })

// ─── WSL installation functions (Windows) ───

/** Install WSL itself (wsl --install -d Ubuntu --no-launch) — UAC elevation */
export const installWsl = async (
  win: BrowserWindow,
  prevState?: WslState
): Promise<{ needsReboot: boolean; state: WslState }> => {
  const log = (msg: string): void => sendProgress(win, msg)
  const baseline = prevState ?? (await checkWslState())

  log(t('installer.wslInstalling'))
  log(t('installer.wslAdminPrompt'))

  try {
    const psCommand = [
      'try {',
      "  $p = Start-Process -FilePath 'wsl' -ArgumentList '--install -d Ubuntu --no-launch' -Verb RunAs -Wait -PassThru;",
      '  exit $p.ExitCode',
      '} catch {',
      '  Write-Output $_.Exception.Message;',
      '  exit 1',
      '}'
    ].join(' ')
    await runWithLog('powershell', ['-NoProfile', '-Command', psCommand], log)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : ''
    const errLines = ((err as RunError).lines ?? []).join('\n')
    const lower = (errMsg + '\n' + errLines).toLowerCase()

    // Definite failures — throw immediately
    if (
      lower.includes('canceled') ||
      lower.includes('cancelled') ||
      lower.includes('elevation') ||
      lower.includes('access denied') ||
      lower.includes('permission')
    ) {
      throw new Error(t('installer.adminRequired'))
    }
    if (lower.includes('not recognized') || lower.includes('not found')) {
      throw new Error(t('installer.windowsVersionError'))
    }
    if (lower.includes('virtualization') || lower.includes('hyper-v')) {
      throw new Error(t('installer.biosVirtualization'))
    }
    // exit -1 (4294967295) is WSL's signal that a reboot is required
    if (errMsg.includes('exit -1') || errMsg.includes('exit 4294967295')) {
      log(t('installer.wslDone'))
      return { needsReboot: true, state: 'needs_reboot' }
    }
    // Other ambiguous errors — fall through to state check
  }

  // Verify actual WSL state regardless of exit code
  log(t('installer.wslCheckingState'))
  const newState = await checkWslState()

  if (newState === 'ready') {
    log(t('installer.wslDone'))
    return { needsReboot: false, state: newState }
  }

  const improved = WSL_STATE_ORDER.indexOf(newState) > WSL_STATE_ORDER.indexOf(baseline)

  if (newState === 'needs_reboot' || improved) {
    log(t('installer.wslDone'))
    return { needsReboot: newState === 'needs_reboot', state: newState }
  }

  // No state change — actual failure; show user-friendly message
  throw new Error(t('installer.wslInstallFailed'))
}

/** Install Node.js 22 LTS inside WSL Ubuntu (NodeSource apt repo) */
export const installNodeWsl = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)

  log(t('installer.wslPackages'))
  try {
    await runInWsl('apt-get update && apt-get install -y curl ca-certificates gnupg', 60000)
  } catch {
    log(t('installer.aptFailed'))
  }

  log(t('installer.nodeWslInstalling'))
  await runInWsl(
    'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs',
    120000
  )

  log(t('installer.nodeWslDone'))
}

/** Python 3 for bundled skills that run scripts (Ubuntu packages inside WSL). */
export const installPythonWsl = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)
  log(t('installer.pythonWslInstalling'))
  await runInWsl(
    'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-pip python3-venv',
    180000
  )
  log(t('installer.pythonWslDone'))
}

/** Install openclaw globally inside WSL Ubuntu */
export const installOpenClawWsl = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)
  log(t('installer.ocWslInstalling'))
  /* PATH-only: avoid OLLAMA mkdir/export here — empty decoded path broke npm postinstall (`mkdir ''`). */
  await runInWsl(`${buildWslPathOnlyPrefix()} && npm install -g ${APPROVED_OPENCLAW_PACKAGE_SPEC}`, 120000)
  log(t('installer.ocWslDone'))
}

/**
 * After install.sh, many WSL setups never get a working systemd — nothing listens on 11434.
 * Try: already up → systemctl start → background `ollama serve` → poll /api/tags.
 */
export async function ensureOllamaApiListeningWsl(log: ProgressCallback = (): void => undefined): Promise<boolean> {
  log(t('installer.ollamaVerifyingApi'))
  const script = `export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
if curl -sf --max-time 4 http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then
  echo __ENCHANTE_OLLAMA_OK__
  exit 0
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl start ollama 2>/dev/null || true
fi
sleep 3
if curl -sf --max-time 4 http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then
  echo __ENCHANTE_OLLAMA_OK__
  exit 0
fi
if command -v ollama >/dev/null 2>&1; then
  if ! command -v pgrep >/dev/null 2>&1 || ! pgrep -x ollama >/dev/null 2>&1; then
    nohup ollama serve >>/tmp/ollama-enchante.log 2>&1 &
  fi
  i=0
  while [ "$i" -lt 25 ]; do
    if curl -sf --max-time 4 http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then
      echo __ENCHANTE_OLLAMA_OK__
      exit 0
    fi
    i=$((i+1))
    sleep 2
  done
fi
echo __ENCHANTE_OLLAMA_FAIL__
exit 0`
  try {
    const out = await runInWsl(script, 120000)
    if (out.includes('__ENCHANTE_OLLAMA_OK__')) {
      log(t('installer.ollamaApiUp'))
      return true
    }
    log(t('installer.ollamaApiStillDown'))
    return false
  } catch (e) {
    log(t('installer.ollamaApiEnsureError', { error: e instanceof Error ? e.message : String(e) }))
    return false
  }
}

/** Install Ollama inside WSL Ubuntu (official script — large download). */
export const installOllamaWsl = async (win: BrowserWindow): Promise<{ apiListening: boolean }> => {
  const log = (msg: string): void => sendProgress(win, msg)
  log(t('installer.ollamaInstalling'))
  log(t('installer.ollamaWslZstdPrep'))
  const modelsDir = bashSingleQuotedWslPath(getResolvedOllamaModelsWslPath())
  const dropB64 = buildOllamaSystemdDropInBase64()
  /* Ollama’s install.sh may require zstd to unpack; ensure it exists in Ubuntu (root in WSL). */
  const ollamaInstallScript = `apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq zstd ca-certificates curl && curl -fsSL https://ollama.com/install.sh | sh && mkdir -p ${modelsDir} && if command -v systemctl >/dev/null 2>&1; then mkdir -p /etc/systemd/system/ollama.service.d && printf '%s' '${dropB64}' | base64 -d > /etc/systemd/system/ollama.service.d/99-openclaw-enchante-models.conf
  systemctl daemon-reload 2>/dev/null || true
  systemctl restart ollama 2>/dev/null || true
fi`
  await runInWslWithLog(ollamaInstallScript, 600000, (line) => log(line))
  const apiListening = await ensureOllamaApiListeningWsl(log)
  log(apiListening ? t('installer.ollamaDoneReady') : t('installer.ollamaDoneButNoApi'))
  return { apiListening }
}

/** After changing the Windows models folder, update systemd + restart ollama in WSL. */
export const applyOllamaModelsEnvWsl = async (): Promise<void> => {
  const modelsDir = bashSingleQuotedWslPath(getResolvedOllamaModelsWslPath())
  const dropB64 = buildOllamaSystemdDropInBase64()
  const script = `mkdir -p ${modelsDir} && if command -v systemctl >/dev/null 2>&1; then mkdir -p /etc/systemd/system/ollama.service.d && printf '%s' '${dropB64}' | base64 -d > /etc/systemd/system/ollama.service.d/99-openclaw-enchante-models.conf
  systemctl daemon-reload 2>/dev/null || true
  systemctl restart ollama 2>/dev/null || true
fi`
  await runInWsl(script, 90000)
}

// ─── macOS installation functions ───

export const installNodeMac = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)
  const url = `https://nodejs.org/dist/v22.14.0/node-v22.14.0.pkg`
  const dest = join(tmpdir(), 'node-installer.pkg')

  log(t('installer.nodeDownloading'))
  await downloadFile(url, dest)
  log(t('installer.nodeInstallerOpening'))
  await runWithLog('open', ['-W', dest], log)
  log(t('installer.nodeDone'))
}

// getPathEnv imported from path-utils.ts (includes NODE_OPTIONS removal)

const isXcodeCliInstalled = (): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn('xcode-select', ['-p'])
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })

const ensureXcodeCli = async (log: ProgressCallback): Promise<void> => {
  if (await isXcodeCliInstalled()) return

  log(t('installer.xcodeOpening'))
  spawn('xcode-select', ['--install'])

  log(t('installer.xcodePrompt'))
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    if (await isXcodeCliInstalled()) {
      log(t('installer.xcodeDone'))
      return
    }
  }
  throw new Error(t('installer.xcodeTimeout'))
}

export const installOpenClaw = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)
  log(t('installer.ocInstalling'))

  await ensureXcodeCli(log)
  const npmCacheDir = join(homedir(), '.npm')
  if (existsSync(npmCacheDir)) {
    const uid = process.getuid?.() ?? 501
    const gid = process.getgid?.() ?? 20
    await runWithLog('chown', ['-R', `${uid}:${gid}`, npmCacheDir], log).catch(() => {})
  }
  const npmGlobalDir = join(homedir(), '.npm-global')
  if (!existsSync(npmGlobalDir)) mkdirSync(npmGlobalDir, { recursive: true })
  await runWithLog('npm', ['config', 'set', 'prefix', npmGlobalDir], log, {
    env: getPathEnv()
  })
  await runWithLog('npm', ['install', '-g', APPROVED_OPENCLAW_PACKAGE_SPEC], log, {
    env: getPathEnv()
  })

  log(t('installer.ocDone'))
}

/** macOS: install Ollama via Homebrew when available. */
export const installOllamaMac = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)
  log(t('installer.ollamaInstalling'))
  try {
    await runWithLog('/usr/local/bin/brew', ['install', 'ollama'], log)
  } catch {
    try {
      await runWithLog('/opt/homebrew/bin/brew', ['install', 'ollama'], log)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`${t('installer.ollamaMacManual')}: ${msg}`)
    }
  }
  log(t('installer.ollamaDone'))
}

/** Linux: official install script (needs curl; may prompt for sudo). */
export const installOllamaLinux = async (win: BrowserWindow): Promise<void> => {
  const log = (msg: string): void => sendProgress(win, msg)
  log(t('installer.ollamaInstalling'))
  await runWithLog('bash', ['-lc', 'curl -fsSL https://ollama.com/install.sh | sh'], log)
  log(t('installer.ollamaDone'))
}
