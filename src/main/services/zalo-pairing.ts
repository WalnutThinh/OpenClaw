import { spawn } from 'child_process'
import { platform } from 'os'
import { getPathEnv, findBin } from './path-utils'
import { buildWslShellPrefix } from './wsl-utils'

const PAIRING_TIMEOUT_MS = 45_000

const shellQuoteSingle = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`

/** Allow only safe pairing codes (OpenClaw-generated style). */
export const isValidZaloPairingCode = (code: string): boolean =>
  /^[A-Za-z0-9_-]{4,36}$/.test(code.trim())

const runOpenclawArgs = (openclawArgs: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const isWin = platform() === 'win32'
    let cmd: string
    let args: string[]

    if (isWin) {
      const oc = openclawArgs.map(shellQuoteSingle).join(' ')
      cmd = 'wsl'
      args = [
        '-d',
        'Ubuntu',
        '-u',
        'root',
        '--',
        'bash',
        '-lc',
        `${buildWslShellPrefix()} && openclaw ${oc}`
      ]
    } else {
      cmd = findBin('openclaw')
      args = openclawArgs
    }

    const child = spawn(cmd, args, {
      env: isWin ? process.env : getPathEnv()
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, PAIRING_TIMEOUT_MS)

    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

/**
 * Run `openclaw pairing list zalo` (stdout for UI).
 */
export const zaloPairingList = async (): Promise<{ ok: boolean; output: string }> => {
  try {
    const { code, stdout, stderr } = await runOpenclawArgs(['pairing', 'list', 'zalo'])
    const out = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
    return { ok: code === 0, output: out || '(no output)' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, output: msg }
  }
}

/**
 * Run `openclaw pairing approve zalo <code>`.
 */
export const zaloPairingApprove = async (code: string): Promise<{ ok: boolean; output: string }> => {
  const trimmed = code.trim()
  if (!isValidZaloPairingCode(trimmed)) {
    return { ok: false, output: 'invalid_code' }
  }
  try {
    const { code: exit, stdout, stderr } = await runOpenclawArgs([
      'pairing',
      'approve',
      'zalo',
      trimmed
    ])
    const out = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
    return { ok: exit === 0, output: out || (exit === 0 ? 'ok' : `exit ${exit}`) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, output: msg }
  }
}
