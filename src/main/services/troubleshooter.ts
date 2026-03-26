import { spawn } from 'child_process'
import * as net from 'net'
import { platform } from 'os'
import { BrowserWindow } from 'electron'
import { getPathEnv, findBin } from './path-utils'
import { buildWslShellPrefix } from './wsl-utils'
import { OPENCLAW_CLI_REPAIR_SUBCOMMAND } from './openclaw-release'
import { sanitizeOpenclawRepairLog } from './openclaw-cli-log'
import { applyOpenclawZaloWebhookPatch } from './openclaw-zalo-patch'
import { t } from '../../shared/i18n/main'

const exec = (
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  shell = false
): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { env, shell })
    let out = ''
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (out += d.toString()))
    child.on('close', () => resolve(out.trim()))
    child.on('error', () => resolve(''))
  })

/** Windows: TCP connect is locale-proof (netstat state text may be translated, e.g. Vietnamese). */
const checkWindowsPortConnect = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, family: 4 })
    socket.setTimeout(2000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })

/** Best-effort PID when port is listening (English + some locales); optional. */
const tryWindowsPidForPort = async (port: number): Promise<string | undefined> => {
  try {
    const ps = await exec(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `try { @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop | Select-Object -First 1 -ExpandProperty OwningProcess) -join '' } catch { '' }`
      ],
      process.env as NodeJS.ProcessEnv,
      true
    )
    const pid = ps.trim()
    if (/^\d+$/.test(pid)) return pid
  } catch {
    /* ignore */
  }
  const out = await exec('netstat', ['-ano'], process.env as NodeJS.ProcessEnv, true)
  const line = out.split(/\r?\n/).find((l) => l.includes(`:${port}`) && /LISTENING/i.test(l))
  if (!line) return undefined
  const last = line.trim().split(/\s+/).pop()
  return /^\d+$/.test(last ?? '') ? last : undefined
}

export const checkPort = async (port = 18789): Promise<{ inUse: boolean; pid?: string }> => {
  const isWin = platform() === 'win32'
  if (isWin) {
    const listening = await checkWindowsPortConnect(port)
    if (!listening) return { inUse: false }
    const pid = await tryWindowsPidForPort(port)
    return { inUse: true, pid }
  }

  const out = await exec('lsof', ['-i', `:${port}`, '-t'], getPathEnv())
  const pid = out.split('\n')[0]?.trim()
  return pid ? { inUse: true, pid } : { inUse: false }
}

/** Probe 127.0.0.1 inside WSL (Linux may listen there while Windows localhost check fails). */
const checkPortListeningInsideWsl = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn(
      'wsl',
      [
        '-d',
        'Ubuntu',
        '-u',
        'root',
        '--',
        'bash',
        '-lc',
        `timeout 3 bash -c 'echo >/dev/tcp/127.0.0.1/${port}' 2>/dev/null`
      ],
      { shell: false }
    )
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })

/**
 * True if the gateway TCP port accepts connections — Windows forward to WSL and/or native.
 * Use for status/dashboard when the listener only shows up inside WSL.
 */
export const isGatewayPortReachable = async (port = 18789): Promise<boolean> => {
  if (platform() !== 'win32') {
    const { inUse } = await checkPort(port)
    return inUse
  }
  if (await checkWindowsPortConnect(port)) return true
  return checkPortListeningInsideWsl(port)
}

export const runFixerFix = async (win: BrowserWindow): Promise<{ success: boolean }> => {
  const pr = await applyOpenclawZaloWebhookPatch()
  if (pr === 'patched') {
    try {
      win.webContents.send('install:progress', sanitizeOpenclawRepairLog(t('gateway.zaloPatchApplied')))
    } catch {
      /* window destroyed */
    }
  } else if (pr === 'error') {
    try {
      win.webContents.send('install:progress', sanitizeOpenclawRepairLog(t('gateway.zaloPatchFailed')))
    } catch {
      /* window destroyed */
    }
  }

  const isWin = platform() === 'win32'
  let cmd: string
  let args: string[]

  if (isWin) {
    cmd = 'wsl'
    args = [
      '-d',
      'Ubuntu',
      '-u',
      'root',
      '--',
      'bash',
      '-lc',
      `rm -rf /root/.openclaw/cache /root/.cache/openclaw /root/.openclaw/extensions/zalo 2>/dev/null; ${buildWslShellPrefix()} && openclaw ${OPENCLAW_CLI_REPAIR_SUBCOMMAND} --fix 2>&1`
    ]
  } else {
    cmd = findBin('npm')
    args = ['exec', '--', 'openclaw', OPENCLAW_CLI_REPAIR_SUBCOMMAND, '--fix']
  }

  return new Promise((resolve) => {
    // Do not use shell:true on Windows with `wsl` — cmd can emit misleading
    // "The system cannot find the path specified" and break argument passing.
    const child = spawn(cmd, args, {
      env: isWin ? process.env : getPathEnv(),
      shell: false
    })

    child.stdout.on('data', (d) => {
      const msg = sanitizeOpenclawRepairLog(d.toString().trim())
      if (msg) {
        try {
          win.webContents.send('install:progress', msg)
        } catch {
          /* window destroyed */
        }
      }
    })
    child.stderr.on('data', (d) => {
      const msg = sanitizeOpenclawRepairLog(d.toString().trim())
      if (msg) {
        try {
          win.webContents.send('install:progress', msg)
        } catch {
          /* window destroyed */
        }
      }
    })
    child.on('close', (code) => resolve({ success: code === 0 }))
    child.on('error', (err) => {
      try {
        win.webContents.send(
          'install:progress',
          `[Fixer] ${err instanceof Error ? err.message : String(err)}`
        )
      } catch {
        /* window destroyed */
      }
      resolve({ success: false })
    })
  })
}
