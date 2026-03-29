import { spawn } from 'child_process'
import { statfs } from 'fs/promises'
import { platform, totalmem } from 'os'
import {
  OLLAMA_RECOMMENDED_MIN_FREE_DISK_BYTES,
  OLLAMA_RECOMMENDED_MIN_RAM_BYTES,
  type OllamaPreflight
} from '../../shared/ollama-preflight'
import { ollamaWizardRequiredFreeDiskBytes } from '../../shared/ollama-disk-wizard'
import { readAppSettings } from './app-settings'
import {
  SETTINGS_OLLAMA_MODELS_WIN_PATH,
  getOllamaDiskCheckWinPath,
  getResolvedOllamaModelsWslPath
} from './ollama-models-path'
import { buildWslShellPrefix, checkWslState, runInWsl, type WslState } from './wsl-utils'
import { getApprovedOpenclawVersion } from './openclaw-release'
import { WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_BYTES } from '../../shared/wsl-windows-disk'

export interface EnvCheckResult {
  os: 'macos' | 'windows' | 'linux'
  nodeInstalled: boolean
  nodeVersion: string | null
  nodeVersionOk: boolean
  openclawInstalled: boolean
  openclawVersion: string | null
  openclawLatestVersion: string | null
  /** True when `ollama` CLI responds (WSL on Windows, native on macOS/Linux). */
  ollamaInstalled: boolean
  ollamaVersion: string | null
  /** Python 3 for bundled skills that run scripts (checked in WSL on Windows when WSL is ready). */
  pythonInstalled: boolean
  pythonVersion: string | null
  pythonVersionOk: boolean
  wslState?: WslState
  /** Host RAM/disk + WSL readiness for the Ollama provider panel. */
  ollamaPreflight: OllamaPreflight
}

const PATH_EXTENSIONS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  process.env.NVM_BIN ?? '',
  `${process.env.HOME}/.volta/bin`,
  `${process.env.HOME}/.npm-global/bin`,
  '/usr/bin',
  '/bin'
]
  .filter(Boolean)
  .join(':')

const getEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: `${PATH_EXTENSIONS}:${process.env.PATH ?? ''}`
})

const runCommand = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: getEnv() })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('timeout after 15000ms'))
    }, 15000)

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr || `exit code ${code}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

const parseVersion = (raw: string): string | null => {
  const match = raw.match(/v?(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

const semverGte = (version: string, min: string): boolean => {
  const [a1, a2, a3] = version.split('.').map(Number)
  const [b1, b2, b3] = min.split('.').map(Number)
  if (a1 !== b1) return a1 > b1
  if (a2 !== b2) return a2 > b2
  return a3 >= b3
}

const checkNodeAndOpenclaw = async (
  run: (cmd: string, args: string[]) => Promise<string>
): Promise<{
  nodeInstalled: boolean
  nodeVersion: string | null
  nodeVersionOk: boolean
  openclawInstalled: boolean
  openclawVersion: string | null
}> => {
  let nodeVersion: string | null = null
  let nodeInstalled = false
  let nodeVersionOk = false
  let openclawInstalled = false
  let openclawVersion: string | null = null

  try {
    const raw = await run('node', ['--version'])
    nodeVersion = parseVersion(raw)
    nodeInstalled = nodeVersion !== null
    nodeVersionOk = nodeVersion ? semverGte(nodeVersion, '22.16.0') : false
  } catch {
    /* not installed */
  }

  try {
    const raw = await run('npm', ['list', '-g', 'openclaw', '--json'])
    const json = JSON.parse(raw)
    const deps = json.dependencies?.openclaw
    if (deps) {
      openclawInstalled = true
      openclawVersion = deps.version ?? null
    }
  } catch {
    /* not installed */
  }

  if (!openclawInstalled || !openclawVersion) {
    try {
      const raw = await run('openclaw', ['--version'])
      const ver = parseVersion(raw)
      if (ver) {
        openclawInstalled = true
        openclawVersion = ver
      }
    } catch {
      /* not installed */
    }
  }

  return { nodeInstalled, nodeVersion, nodeVersionOk, openclawInstalled, openclawVersion }
}

const getHostFreeDiskBytesAt = async (targetPath: string): Promise<{ bytes: number | null; path: string }> => {
  try {
    const s = await statfs(targetPath)
    const bavail = typeof s.bavail === 'bigint' ? Number(s.bavail) : Number(s.bavail)
    const bsize = typeof s.bsize === 'bigint' ? Number(s.bsize) : Number(s.bsize)
    return { bytes: bavail * bsize, path: targetPath }
  } catch {
    return { bytes: null, path: targetPath }
  }
}

/** Free space on the Windows system drive (where WSL/Ubuntu vhdx usually lives). */
export const getWslWindowsSystemDriveDiskHint = async (): Promise<{
  supported: boolean
  checkPath: string
  driveLabel: string
  freeBytes: number | null
  recommendedMinBytes: number
  meetsRecommendation: boolean | null
}> => {
  if (platform() !== 'win32') {
    return {
      supported: false,
      checkPath: '',
      driveLabel: '',
      freeBytes: null,
      recommendedMinBytes: WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_BYTES,
      meetsRecommendation: null
    }
  }
  const driveLabel = (process.env.SystemDrive ?? 'C:').trim()
  const root = driveLabel.endsWith('\\') ? driveLabel : `${driveLabel}\\`
  const { bytes: freeBytes } = await getHostFreeDiskBytesAt(root)
  const meetsRecommendation =
    freeBytes === null ? null : freeBytes >= WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_BYTES
  return {
    supported: true,
    checkPath: root,
    driveLabel,
    freeBytes,
    recommendedMinBytes: WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_BYTES,
    meetsRecommendation
  }
}

/** Before Config: ensure the Ollama models drive has room for pull + headroom. */
export const checkOllamaWizardDiskSpace = async (
  modelId?: string
): Promise<{
  ok: boolean
  freeBytes: number | null
  requiredBytes: number
  checkPath: string
}> => {
  const requiredBytes = ollamaWizardRequiredFreeDiskBytes(modelId)
  const checkPath = platform() === 'win32' ? getOllamaDiskCheckWinPath() : '/'
  const { bytes: freeBytes } = await getHostFreeDiskBytesAt(checkPath)
  const ok = freeBytes === null || freeBytes >= requiredBytes
  return { ok, freeBytes, requiredBytes, checkPath }
}

const buildOllamaPreflight = async (
  os: EnvCheckResult['os'],
  wslState: WslState | undefined
): Promise<OllamaPreflight> => {
  const totalRamBytes = totalmem()
  const diskPath = os === 'windows' ? getOllamaDiskCheckWinPath() : '/'
  const { bytes: freeDiskBytes, path: freeDiskCheckPath } = await getHostFreeDiskBytesAt(diskPath)
  const wslReadyForOllama = os !== 'windows' || wslState === 'ready'
  const winPathRaw = readAppSettings()[SETTINGS_OLLAMA_MODELS_WIN_PATH]
  const ollamaModelsWinPath =
    typeof winPathRaw === 'string' && winPathRaw.trim() ? winPathRaw.trim() : null
  return {
    totalRamBytes,
    freeDiskBytes,
    freeDiskCheckPath,
    wslReadyForOllama,
    ramMeetsRecommendation: totalRamBytes >= OLLAMA_RECOMMENDED_MIN_RAM_BYTES,
    diskMeetsRecommendation:
      freeDiskBytes === null ? null : freeDiskBytes >= OLLAMA_RECOMMENDED_MIN_FREE_DISK_BYTES,
    ollamaModelsWinPath,
    ollamaModelsWslPath: getResolvedOllamaModelsWslPath()
  }
}

const checkOllama = async (
  run: (cmd: string, args: string[]) => Promise<string>
): Promise<{ installed: boolean; version: string | null }> => {
  try {
    const raw = (await run('ollama', ['--version'])).trim()
    const line = raw.split('\n')[0] ?? raw
    const v = line.replace(/^ollama\s+version\s*/i, '').trim() || line
    return { installed: true, version: v || null }
  } catch {
    return { installed: false, version: null }
  }
}

/** Prefer stdout-friendly probe (`python --version` often writes to stderr). */
const checkPython = async (
  run: (cmd: string, args: string[]) => Promise<string>
): Promise<{ installed: boolean; version: string | null; versionOk: boolean }> => {
  const probe = async (bin: 'python3' | 'python'): Promise<string | null> => {
    try {
      const raw = (
        await run(bin, ['-c', 'import platform; print(platform.python_version())'])
      ).trim()
      const v = raw.split('\n')[0]?.trim() ?? ''
      return /^\d+\.\d+\.\d+/.test(v) ? v : null
    } catch {
      return null
    }
  }
  let version = await probe('python3')
  if (!version) version = await probe('python')
  if (!version) return { installed: false, version: null, versionOk: false }
  const versionOk = semverGte(version, '3.10.0')
  return { installed: true, version, versionOk }
}

export interface OpenclawUpdateInfo {
  currentVersion: string | null
  latestVersion: string | null
}

export const checkOpenclawUpdate = async (): Promise<OpenclawUpdateInfo> => {
  const os = platform() === 'win32' ? 'windows' : 'other'

  const getCurrentVersion = async (): Promise<string | null> => {
    try {
      if (os === 'windows') {
        const shellEscape = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`
        const wslRun = (cmd: string, args: string[]): Promise<string> =>
          runInWsl(`${buildWslShellPrefix()} && ${cmd} ${args.map(shellEscape).join(' ')}`)
        const raw = await wslRun('npm', ['list', '-g', 'openclaw', '--json'])
        const json = JSON.parse(raw)
        return json.dependencies?.openclaw?.version ?? null
      } else {
        const raw = await runCommand('npm', ['list', '-g', 'openclaw', '--json'])
        const json = JSON.parse(raw)
        return json.dependencies?.openclaw?.version ?? null
      }
    } catch {
      return null
    }
  }

  const getLatestVersion = async (): Promise<string | null> => getApprovedOpenclawVersion()

  const [currentVersion, latestVersion] = await Promise.all([
    getCurrentVersion(),
    getLatestVersion()
  ])

  return { currentVersion, latestVersion }
}

export const checkEnvironment = async (): Promise<EnvCheckResult> => {
  const os = platform() === 'darwin' ? 'macos' : platform() === 'win32' ? 'windows' : 'linux'

  let wslState: WslState | undefined
  let nodeInstalled = false
  let nodeVersion: string | null = null
  let nodeVersionOk = false
  let openclawInstalled = false
  let openclawVersion: string | null = null
  let ollamaInstalled = false
  let ollamaVersion: string | null = null
  let pythonInstalled = false
  let pythonVersion: string | null = null
  let pythonVersionOk = false

  if (os === 'windows') {
    // Windows: check WSL state, then check Node.js/OpenClaw inside WSL if ready
    wslState = await checkWslState()

    if (wslState === 'ready') {
      const shellEscape = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`
      const wslRun = (cmd: string, args: string[]): Promise<string> =>
        runInWsl(`${buildWslShellPrefix()} && ${cmd} ${args.map(shellEscape).join(' ')}`)

      const result = await checkNodeAndOpenclaw(wslRun)
      nodeInstalled = result.nodeInstalled
      nodeVersion = result.nodeVersion
      nodeVersionOk = result.nodeVersionOk
      openclawInstalled = result.openclawInstalled
      openclawVersion = result.openclawVersion
      const o = await checkOllama(wslRun)
      ollamaInstalled = o.installed
      ollamaVersion = o.version
      const py = await checkPython(wslRun)
      pythonInstalled = py.installed
      pythonVersion = py.version
      pythonVersionOk = py.versionOk
    }
    // Keep all false if wslState !== 'ready'
  } else {
    // macOS / Linux
    const result = await checkNodeAndOpenclaw(runCommand)
    nodeInstalled = result.nodeInstalled
    nodeVersion = result.nodeVersion
    nodeVersionOk = result.nodeVersionOk
    openclawInstalled = result.openclawInstalled
    openclawVersion = result.openclawVersion
    const o = await checkOllama(runCommand)
    ollamaInstalled = o.installed
    ollamaVersion = o.version
    const py = await checkPython(runCommand)
    pythonInstalled = py.installed
    pythonVersion = py.version
    pythonVersionOk = py.versionOk
  }

  const openclawLatestVersion: string | null = await getApprovedOpenclawVersion()
  const ollamaPreflight = await buildOllamaPreflight(os, wslState)

  return {
    os,
    nodeInstalled,
    nodeVersion,
    nodeVersionOk,
    openclawInstalled,
    openclawVersion,
    openclawLatestVersion,
    ollamaInstalled,
    ollamaVersion,
    pythonInstalled,
    pythonVersion,
    pythonVersionOk,
    wslState,
    ollamaPreflight
  }
}
