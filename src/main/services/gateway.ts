import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'
import { getPathEnv, findBin } from './path-utils'
import { isGatewayPortReachable } from './troubleshooter'
import { buildWslShellPrefix } from './wsl-utils'
import {
  mergeProcessEnvWithGoogleWorkspaceCredentials,
  wslBashSnippetExportGoogleApplicationCredentialsIfKeyExists
} from './google-workspace-skill-setup'
import { OPENCLAW_CLI_REPAIR_SUBCOMMAND } from './openclaw-release'
import { sanitizeOpenclawRepairLog } from './openclaw-cli-log'
import { applyOpenclawZaloWebhookPatch } from './openclaw-zalo-patch'
import { t } from '../../shared/i18n/main'

export interface GatewayResult {
  status: string
  error?: string
}

// Windows WSL: keep gateway as a foreground process
let wslGatewayProcess: ChildProcess | null = null

// Gateway log callback (set from ipc-handlers)
let logCallback: ((msg: string) => void) | null = null

export const setGatewayLogCallback = (cb: ((msg: string) => void) | null): void => {
  logCallback = cb
}

const emitLog = (msg: string): void => {
  logCallback?.(msg)
}

const runGateway = (args: string[]): Promise<string> => {
  const openclaw = findBin('openclaw')
  const fullArgs = ['gateway', ...args]

  return new Promise((resolve, reject) => {
    const child = spawn(openclaw, fullArgs, {
      env: mergeProcessEnvWithGoogleWorkspaceCredentials(getPathEnv())
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr || `exit code ${code}`))
    })
    child.on('error', reject)
  })
}

const startGatewayWsl = async (): Promise<GatewayResult> => {
  if (wslGatewayProcess) {
    wslGatewayProcess.kill()
    wslGatewayProcess = null
  }
  await killWslGateway()
  await new Promise((r) => setTimeout(r, 1000))

  try {
    const pr = await applyOpenclawZaloWebhookPatch()
    if (pr === 'patched') {
      emitLog(t('gateway.zaloPatchApplied'))
    } else if (pr === 'error') {
      emitLog(t('gateway.zaloPatchFailed'))
    }
  } catch {
    /* ignore patch failures */
  }

  // Run repair *before* `openclaw gateway run`. `doctor --fix` can restart/stop the
  // gateway process; doing it after spawn caused SIGTERM shortly after connect (WS 1006).
  await runFixerFix()

  // Fixer may have started the systemd/user supervised gateway — free the port for our child.
  emitLog(t('gateway.stopSupervisedBeforeRun'))
  await stopSupervisedGatewayWsl()
  await killWslGateway()
  await waitUntilPortFree()

  return new Promise((resolve) => {
    let settled = false
    let stderrBuffer = ''

    const done = (r: GatewayResult): void => {
      if (settled) return
      settled = true
      resolve(r)
    }

    const isAlreadyRunningLog = (s: string): boolean =>
      /already running|port.*18789|address already in use|failed to start|in use/i.test(s)

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
        `${buildWslShellPrefix()} && export NODE_OPTIONS=--dns-result-order=ipv4first && ${wslBashSnippetExportGoogleApplicationCredentialsIfKeyExists()} && openclaw gateway run`
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    wslGatewayProcess = child

    const clearTimers = (): void => {
      clearInterval(pollTimer)
      clearTimeout(failTimer)
    }

    const failTimer = setTimeout(() => {
      if (settled) return
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      emitLog(t('gateway.startTimeout'))
      done({ status: 'error', error: t('gateway.startTimeout') })
    }, 120_000)

    const pollTimer = setInterval(() => {
      void (async () => {
        if (settled) return
        if (await isGatewayPortReachable()) {
          await new Promise((r) => setTimeout(r, 300))
          if (settled) return
          if (await isGatewayPortReachable()) {
            clearTimers()
            done({ status: 'started' })
          }
        }
      })()
    }, 450)

    child.stdout.on('data', (d) => {
      const msg = d.toString().trim()
      if (msg) emitLog(msg)
    })

    child.stderr.on('data', (d) => {
      const msg = d.toString().trim()
      if (msg) {
        emitLog(msg)
        stderrBuffer += msg + '\n'
      }
    })

    child.on('close', async (code) => {
      wslGatewayProcess = null
      clearTimers()
      emitLog(t('gateway.processExit', { code }))
      if (code !== 0 && stderrBuffer) {
        emitLog(`${t('gateway.errorDetail')}\n${stderrBuffer.trim()}`)
      }
      if (settled) return

      if (code === 0) {
        await new Promise((r) => setTimeout(r, 1500))
        if (await isGatewayPortReachable()) {
          emitLog(t('gateway.adoptAfterExit'))
          done({ status: 'started' })
          return
        }
        done({ status: 'stopped' })
        return
      }

      const errText = stderrBuffer.trim()
      if (isAlreadyRunningLog(errText)) {
        await new Promise((r) => setTimeout(r, 600))
        if (await isGatewayPortReachable()) {
          emitLog(t('gateway.usingExistingListener'))
          done({ status: 'started' })
          return
        }
      }
      done({ status: 'error', error: errText || `exit code ${code}` })
    })

    child.on('error', (err) => {
      wslGatewayProcess = null
      clearTimers()
      emitLog(t('gateway.error', { message: err.message }))
      done({ status: 'error', error: err.message })
    })
  })
}

const killWslGateway = (): Promise<void> =>
  new Promise((resolve) => {
    const child = spawn('wsl', [
      '-d',
      'Ubuntu',
      '-u',
      'root',
      '--',
      'pkill',
      '-9',
      '-f',
      'openclaw'
    ])
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })

/**
 * `doctor --fix` may start the supervised gateway (systemd user unit). Our UI uses a
 * foreground `openclaw gateway run` child — stop the service first or bind fails with
 * "gateway already running" / port in use while Enchante thinks the child died (1006).
 */
const stopSupervisedGatewayWsl = (): Promise<void> =>
  new Promise((resolve) => {
    const script = `${buildWslShellPrefix()} && set +e; openclaw gateway stop 2>/dev/null; sleep 2; systemctl --user stop openclaw-gateway.service 2>/dev/null; systemctl stop openclaw-gateway.service 2>/dev/null; sleep 1; pkill -9 -f openclaw-gateway 2>/dev/null; sleep 1; true`
    const child = spawn('wsl', [
      '-d',
      'Ubuntu',
      '-u',
      'root',
      '--',
      'bash',
      '-lc',
      script
    ])
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })

/** Wait until nothing listens on 18789 (after stop/kill). Uses WSL probe on Windows. */
const waitUntilPortFree = async (timeoutMs = 20000): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!(await isGatewayPortReachable())) return
    await new Promise((r) => setTimeout(r, 400))
  }
}

const stopGatewayWsl = async (): Promise<string> => {
  if (wslGatewayProcess) {
    wslGatewayProcess.kill()
    wslGatewayProcess = null
  }
  await stopSupervisedGatewayWsl()
  await killWslGateway()
  await new Promise((r) => setTimeout(r, 1000))
  return 'stopped'
}

/** Runs OpenClaw automated repair (`openclaw <subcommand> --fix` — subcommand name is defined by the OpenClaw package). */
const runFixerFix = (): Promise<void> =>
  new Promise((resolve) => {
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
        `${buildWslShellPrefix()} && openclaw ${OPENCLAW_CLI_REPAIR_SUBCOMMAND} --fix`
      ]
    } else {
      cmd = findBin('openclaw')
      args = [OPENCLAW_CLI_REPAIR_SUBCOMMAND, '--fix']
    }

    const child = spawn(cmd, args, {
      env: isWin ? process.env : getPathEnv()
    })
    child.stdout.on('data', (d) => {
      const msg = sanitizeOpenclawRepairLog(d.toString().trim())
      if (msg) emitLog(msg)
    })
    child.stderr.on('data', (d) => {
      const msg = sanitizeOpenclawRepairLog(d.toString().trim())
      if (msg) emitLog(msg)
    })
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })

const forceKillGateway = (): Promise<void> =>
  new Promise((resolve) => {
    const child = spawn('pkill', ['-f', 'openclaw gateway'])
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })

export const waitUntilStopped = async (timeoutMs = 15000): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!(await isGatewayPortReachable())) return
    await new Promise((r) => setTimeout(r, 500))
  }
  if (platform() !== 'win32') {
    await forceKillGateway()
    await new Promise((r) => setTimeout(r, 1000))
  }
}

export const startGateway = async (): Promise<GatewayResult> => {
  const isWin = platform() === 'win32'
  if (isWin) {
    // Fixer runs inside startGatewayWsl (before gateway spawn), not after — see comment there.
    return startGatewayWsl()
  }

  try {
    const pr = await applyOpenclawZaloWebhookPatch()
    if (pr === 'patched') {
      emitLog(t('gateway.zaloPatchApplied'))
    } else if (pr === 'error') {
      emitLog(t('gateway.zaloPatchFailed'))
    }
    await runFixerFix()
    try {
      await runGateway(['stop'])
    } catch {
      /* already stopped */
    }
    await runGateway(['start'])
    return { status: 'started' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isServiceMissing =
      msg.includes('not loaded') || msg.includes('not installed') || msg.includes('bootstrap')
    if (!isServiceMissing) return { status: 'error', error: msg }

    // Auto-install and retry when launchd service is not installed
    emitLog(t('gateway.notInstalledRetry'))
    try {
      await runGateway(['install'])
      await runFixerFix()
      try {
        await runGateway(['stop'])
      } catch {
        /* already stopped */
      }
      await runGateway(['start'])
      return { status: 'started' }
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      return { status: 'error', error: retryMsg }
    }
  }
}

export const stopGateway = (): Promise<string> => {
  const isWin = platform() === 'win32'
  if (isWin) return stopGatewayWsl()
  return runGateway(['stop'])
}

export const restartGateway = async (): Promise<GatewayResult> => {
  try {
    await stopGateway()
  } catch {
    /* already stopped */
  }
  await waitUntilStopped()
  return startGateway()
}

/**
 * One-shot: ready for dashboard/channels — start if needed, retry stop+start once on failure.
 * Non-technical users should not need Troubleshoot for a first-run gateway.
 */
export const ensureGatewayReady = async (): Promise<{ ok: boolean; error?: string }> => {
  if ((await getGatewayStatus()) === 'running') return { ok: true }
  let result = await startGateway()
  if (result.status === 'started') return { ok: true }
  emitLog(t('gateway.ensureRetry'))
  try {
    await stopGateway()
  } catch {
    /* ignore */
  }
  await waitUntilStopped(25_000)
  result = await startGateway()
  return result.status === 'started'
    ? { ok: true }
    : { ok: false, error: result.error }
}

export const getGatewayStatus = async (): Promise<'running' | 'stopped'> => {
  if (platform() === 'win32') {
    if (wslGatewayProcess && !wslGatewayProcess.killed) return 'running'
    if (await isGatewayPortReachable()) return 'running'
    return 'stopped'
  }
  try {
    const output = await runGateway(['status'])
    return output.toLowerCase().includes('running') ? 'running' : 'stopped'
  } catch {
    return 'stopped'
  }
}
