import { readAppSettings } from './app-settings'

/** UserData key: Windows folder where Ollama model blobs should live (`…/models` in WSL). */
export const SETTINGS_OLLAMA_MODELS_WIN_PATH = 'ollamaModelsWinPath'

/**
 * Convert e.g. `D:\OpenClaw\Ollama` → `/mnt/d/OpenClaw/Ollama/models`.
 * Returns null if not a local drive path.
 */
export function winPathToOllamaModelsWslPath(winPathRaw: string): string | null {
  const t = winPathRaw.trim()
  if (!t) return null
  const m = /^([a-zA-Z]):[\\/]?(.*)$/.exec(t)
  if (!m) return null
  const letter = m[1].toLowerCase()
  let rest = m[2].replace(/\\/g, '/').replace(/\/+$/, '')
  if (rest.length && !rest.startsWith('/')) rest = `/${rest}`
  const base = `/mnt/${letter}${rest}`
  return `${base}/models`
}

/** Absolute WSL path to the Ollama models directory (blobs). */
export function getResolvedOllamaModelsWslPath(): string {
  const raw = readAppSettings()[SETTINGS_OLLAMA_MODELS_WIN_PATH]
  if (typeof raw !== 'string') return '/root/.ollama/models'
  const trimmed = raw.trim()
  if (!trimmed) return '/root/.ollama/models'
  const mapped = winPathToOllamaModelsWslPath(trimmed) ?? '/root/.ollama/models'
  const out = mapped.trim()
  return out.length ? out : '/root/.ollama/models'
}

/** Bash single-quoted literal for a WSL path (safe for export OLLAMA_MODELS=...). */
export function bashSingleQuotedWslPath(p: string): string {
  const safe = (p.trim() || '/root/.ollama/models').replace(/'/g, "'\\''")
  return `'${safe}'`
}

/** Base64 of systemd drop-in file (avoids heredoc/quote bugs for arbitrary paths). */
export function buildOllamaSystemdDropInBase64(): string {
  const p = getResolvedOllamaModelsWslPath()
  const esc = p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const content = `[Service]\nEnvironment="OLLAMA_MODELS=${esc}"\n`
  return Buffer.from(content, 'utf8').toString('base64')
}

/**
 * Export OLLAMA_MODELS + mkdir on the same quoted literal (not `"$OLLAMA_MODELS"`) so an empty
 * expansion can never produce `mkdir ''` if the var is unset in a subshell.
 */
export function getOllamaModelsShellExport(): string {
  const q = bashSingleQuotedWslPath(getResolvedOllamaModelsWslPath())
  return `export OLLAMA_MODELS=${q} && mkdir -p ${q}`
}

/** Windows path used for free-space check (drive root), e.g. `D:\\`. */
export function getOllamaDiskCheckWinPath(): string {
  const raw = readAppSettings()[SETTINGS_OLLAMA_MODELS_WIN_PATH]
  if (typeof raw === 'string' && raw.trim()) {
    const m = /^([a-zA-Z]):/i.exec(raw.trim())
    if (m) {
      const letter = m[1].toUpperCase()
      return `${letter}:\\`
    }
  }
  if (process.platform === 'win32') {
    return `${(process.env.SystemDrive || 'C:').replace(/\\$/, '')}\\`
  }
  return '/'
}
