import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { getOllamaModelsShellExport } from './ollama-models-path'

export type WslState =
  | 'not_available'
  | 'not_installed'
  | 'needs_reboot'
  | 'no_distro'
  | 'not_initialized'
  | 'ready'

export interface WslDiagnosticsResult {
  state: WslState
  lines: string[]
}

/** Progression order of WSL states (used for before/after comparison) */
export const WSL_STATE_ORDER: readonly WslState[] = [
  'not_available',
  'not_installed',
  'needs_reboot',
  'no_distro',
  'not_initialized',
  'ready'
] as const

const WSL_DISTRO = 'Ubuntu'
const WSL_USER = 'root'

/**
 * Force Linux `npm` / `openclaw` (under `/usr/...`) before any Windows path.
 * If PATH picks `npm` from `/mnt/c/.../AppData/Roaming/npm`, packages live on NTFS → WSL shows mode **777**,
 * and OpenClaw **blocks all plugins** (“world-writable path”), including telegram / memory-core.
 */
export const WSL_LINUX_PATH_PREFIX =
  'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.npm-global/bin"'

/** Force Linux npm before Windows `/mnt/c/.../npm` (global install must not land on NTFS). */
export function buildWslPathOnlyPrefix(): string {
  return WSL_LINUX_PATH_PREFIX
}

/** Full prefix: Linux PATH + Ollama models dir (for `openclaw` / gateway / doctor). */
export function buildWslShellPrefix(): string {
  return `${WSL_LINUX_PATH_PREFIX} && ${getOllamaModelsShellExport()}`
}

const runCmd = (cmd: string, args: string[], timeout = 15000): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('timeout'))
    }, timeout)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.replace(/\0/g, '').trim())
      else reject(new Error(stderr.replace(/\0/g, '') || `exit ${code}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

export const checkWslState = async (): Promise<WslState> => {
  // Check WSL availability (--version only supported on Store WSL)
  try {
    await runCmd('wsl', ['--version'])
  } catch {
    // Inbox WSL doesn't support --version → re-check by verifying wsl.exe exists
    try {
      await runCmd('where', ['wsl'])
    } catch {
      return 'not_available'
    }
  }

  // Check if reboot is needed via wsl --status
  try {
    const status = await runCmd('wsl', ['--status'])
    if (status.includes('reboot') || status.includes('restart') || status.includes('재부팅')) {
      return 'needs_reboot'
    }
  } catch {
    // Reboot may be needed if --status fails
    // Proceed with additional check via wsl --list
  }

  // Check if Ubuntu distro exists
  try {
    const list = await runCmd('wsl', ['--list', '--verbose'])
    if (!list.includes(WSL_DISTRO)) {
      return 'no_distro'
    }
    // Verify Ubuntu is registered and working properly
    try {
      await runCmd('wsl', ['-d', WSL_DISTRO, '-u', WSL_USER, '--', 'echo', 'ok'])
      return 'ready'
    } catch {
      return 'not_initialized'
    }
  } catch {
    // --list failed → WSL installed but not yet initialized
    return 'not_installed'
  }
}

/**
 * Human-readable diagnostics for support, without requiring the user to run terminal commands.
 * Collects WSL status plus key optional-feature flags often blocking installation.
 */
export const diagnoseWslInstall = async (): Promise<WslDiagnosticsResult> => {
  const lines: string[] = []
  const push = (s: string): void => {
    lines.push(s)
  }

  const safeRun = async (cmd: string, args: string[]): Promise<string | null> => {
    try {
      return await runCmd(cmd, args, 20000)
    } catch {
      return null
    }
  }

  const state = await checkWslState()
  push(`Detected state: ${state}`)

  const whereWsl = await safeRun('where', ['wsl'])
  push(`where wsl: ${whereWsl ? 'ok' : 'missing'}`)
  if (whereWsl) push(whereWsl)

  const status = await safeRun('wsl', ['--status'])
  push('wsl --status:')
  push(status ?? '(failed)')

  const version = await safeRun('wsl', ['--version'])
  push('wsl --version:')
  push(version ?? '(failed / inbox WSL may not support this flag)')

  const list = await safeRun('wsl', ['--list', '--verbose'])
  push('wsl --list --verbose:')
  push(list ?? '(failed)')

  const vmFeature = await safeRun('dism.exe', [
    '/online',
    '/get-featureinfo',
    '/featurename:VirtualMachinePlatform'
  ])
  push('Feature VirtualMachinePlatform:')
  push(vmFeature ?? '(failed)')

  const wslFeature = await safeRun('dism.exe', [
    '/online',
    '/get-featureinfo',
    '/featurename:Microsoft-Windows-Subsystem-Linux'
  ])
  push('Feature Microsoft-Windows-Subsystem-Linux:')
  push(wslFeature ?? '(failed)')

  return { state, lines }
}

/** Run command via bash -lc inside WSL Ubuntu (auto-loads nvm PATH) */
export const runInWsl = (script: string, timeout = 30000): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('wsl', ['-d', WSL_DISTRO, '-u', WSL_USER, '--', 'bash', '-lc', script])
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('timeout'))
    }, timeout)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.replace(/\0/g, '').trim())
      else reject(new Error(stderr.replace(/\0/g, '') || `exit ${code}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

const streamWslLines = (
  decoder: StringDecoder,
  carry: { buf: string },
  chunk: Buffer,
  onLine: (line: string) => void
): void => {
  carry.buf += decoder.write(chunk)
  let nl: number
  while ((nl = carry.buf.indexOf('\n')) >= 0) {
    const line = carry.buf.slice(0, nl).replace(/\r$/, '')
    carry.buf = carry.buf.slice(nl + 1)
    if (line.length) onLine(line)
  }
}

const flushWslCarry = (
  decoder: StringDecoder,
  carry: { buf: string },
  onLine: (line: string) => void
): void => {
  carry.buf += decoder.end()
  const rest = carry.buf.replace(/\r$/, '').trimEnd()
  carry.buf = ''
  if (rest.length) onLine(rest)
}

/**
 * Like `runInWsl`, but streams stdout/stderr line-by-line (for long installs e.g. Ollama script).
 */
export const runInWslWithLog = (
  script: string,
  timeoutMs: number,
  onLine: (line: string) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('wsl', ['-d', WSL_DISTRO, '-u', WSL_USER, '--', 'bash', '-lc', script])
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('timeout'))
    }, timeoutMs)
    const outDec = new StringDecoder('utf8')
    const errDec = new StringDecoder('utf8')
    const outCarry = { buf: '' }
    const errCarry = { buf: '' }
    const collected: string[] = []
    const emit = (line: string): void => {
      collected.push(line)
      onLine(line)
    }
    child.stdout.on('data', (d) => streamWslLines(outDec, outCarry, d as Buffer, emit))
    child.stderr.on('data', (d) => streamWslLines(errDec, errCarry, d as Buffer, emit))
    child.on('close', (code) => {
      clearTimeout(timer)
      flushWslCarry(outDec, outCarry, emit)
      flushWslCarry(errDec, errCarry, emit)
      if (code === 0) resolve()
      else {
        const tail = collected.length ? collected.slice(-12).join('\n') : ''
        reject(new Error(tail || `WSL command failed (exit ${code})`))
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

/** WSL2 guest IP (first IPv4 from `hostname -I`), for host→guest TCP checks from Windows */
export const getWslIp = async (): Promise<string | null> => {
  try {
    const out = await runInWsl('hostname -I', 5000)
    const first = out.trim().split(/\s+/)[0] ?? ''
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(first) ? first : null
  } catch {
    return null
  }
}

/** Read file inside WSL */
export const readWslFile = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('wsl', ['-d', WSL_DISTRO, '-u', WSL_USER, '--', 'cat', path])
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Timeout reading ${path}`))
    }, 10000)
    let stdout = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`Failed to read ${path}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

/** Write file inside WSL */
export const writeWslFile = (path: string, content: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('wsl', ['-d', WSL_DISTRO, '-u', WSL_USER, '--', 'tee', path])
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Timeout writing ${path}`))
    }, 10000)
    child.stdout.resume() // Consume tee stdout to prevent buffer hang
    child.stdin.write(content, () => child.stdin.end())
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Failed to write ${path}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
