import http from 'http'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { networkInterfaces, platform } from 'os'
import { runInWsl } from './wsl-utils'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** If `OLLAMA_HOST` is set for the Electron process, use it for probes (maps `0.0.0.0` → `127.0.0.1` for clients). */
function normalizeOllamaHostEnvToBaseUrl(): string | null {
  const v = process.env.OLLAMA_HOST?.trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://')) {
    return v.replace(/\/$/, '').replace('://0.0.0.0:', '://127.0.0.1:')
  }
  let rest = v
  if (/^\d+$/.test(rest)) rest = `127.0.0.1:${rest}`
  else if (!rest.includes(':')) rest = `${rest}:11434`
  if (rest.startsWith('0.0.0.0:')) rest = rest.replace(/^0\.0\.0\.0:/, '127.0.0.1:')
  return `http://${rest}`
}

function getWindowsOllamaExeCandidates(): string[] {
  if (platform() !== 'win32') return []
  const la = process.env.LOCALAPPDATA
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  const pfx86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const paths = [
    la ? join(la, 'Programs', 'Ollama', 'Ollama.exe') : '',
    join(pf, 'Ollama', 'Ollama.exe'),
    join(pfx86, 'Ollama', 'Ollama.exe')
  ].filter((p) => p.length > 16 && existsSync(p))
  return [...new Set(paths)]
}

/** True when the official Windows installer likely ran (Ollama.exe in default locations). */
export function windowsOllamaStandardInstallFound(): boolean {
  return getWindowsOllamaExeCandidates().length > 0
}

/**
 * WSL: many installs have `ollama` binary but no working systemd — start `ollama serve` in background.
 * Always exits 0 so we never fail the wizard on script quirks.
 */
const WSL_BOOT_OLLAMA_SCRIPT = [
  'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"',
  'if command -v ollama >/dev/null 2>&1; then',
  '  if ! curl -sf --max-time 1 http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then',
  '    if command -v pgrep >/dev/null 2>&1 && pgrep -x ollama >/dev/null 2>&1; then',
  '      :',
  '    else',
  '      nohup ollama serve >>/tmp/ollama-enchante.log 2>&1 &',
  '    fi',
  '  fi',
  'fi',
  'exit 0'
].join('\n')

/** Ollama can be slow on first cold start; WSL curl uses the same ceiling. */
const OLLAMA_PROBE_TIMEOUT_MS = 8000
const OLLAMA_WSL_CURL_MAX_SEC = 8

const WINDOWS_OLLAMA_LOOPBACK_BASES = [
  'http://127.0.0.1:11434',
  'http://localhost:11434',
  'http://[::1]:11434'
] as const

const isIpv4 = (s: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

/** systemd-resolved stub / loopback are not the Windows host for WSL2 NAT. */
const isUsableWslHostCandidate = (ip: string): boolean => {
  if (!isIpv4(ip)) return false
  if (ip.startsWith('127.')) return false
  return true
}

/**
 * Windows: IPv4 on the vEthernet/WSL Hyper-V adapter is usually the host side of the WSL2 NAT
 * (same as `default via` in WSL) when resolv.conf only lists 127.0.0.53.
 */
export function getWindowsWslVirtualSwitchHostIp(): string | null {
  if (platform() !== 'win32') return null
  const ifs = networkInterfaces()
  for (const name of Object.keys(ifs)) {
    const key = name.toLowerCase()
    if (!key.includes('wsl') && !key.includes('hyper-v')) continue
    for (const addr of ifs[name] ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      if (isUsableWslHostCandidate(addr.address)) return addr.address
    }
  }
  return null
}

/** Probe Ollama HTTP API from inside WSL (same context as `openclaw onboard`). */
export async function probeOllamaInWsl(baseUrl: string): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, '')
  const q = base.replace(/'/g, "'\\''")
  const tryCurl = `curl -sf --max-time ${OLLAMA_WSL_CURL_MAX_SEC} '${q}/api/tags' -o /dev/null`
  const tryWget = `wget -q -T ${OLLAMA_WSL_CURL_MAX_SEC} -O /dev/null '${q}/api/tags' 2>/dev/null`
  try {
    await runInWsl(tryCurl, 15000)
    return true
  } catch {
    /* curl missing or connection failed */
  }
  try {
    await runInWsl(tryWget, 15000)
    return true
  } catch {
    return false
  }
}

/**
 * Factual checks inside WSL Ubuntu for in-app diagnosis (no terminal for the user).
 * OpenClaw uses the same distro/user as `runInWsl`.
 */
export async function collectOllamaWslConnectivityDiagnostics(): Promise<string[]> {
  if (platform() !== 'win32') {
    return ['(Diagnostics only run on Windows — WSL path.)']
  }
  // Never merge curl stderr into `$(...)`: messages like `curl: (3) ...` contain `)` and can break parsing.
  const script = [
    'set +e',
    'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"',
    'wo=$(command -v ollama 2>/dev/null || echo MISSING)',
    'echo "which_ollama=$wo"',
    'if command -v ollama >/dev/null 2>&1; then ollama --version 2>&1 | head -n1 | sed "s/^/ollama_version=/" || echo "ollama_version=(failed)"; fi',
    'if command -v pgrep >/dev/null 2>&1; then pc=$(pgrep -c -x ollama 2>/dev/null); echo "ollama_pgrep_count=${pc:-0}"; else echo "ollama_pgrep_count=(no pgrep)"; fi',
    'hc=$(curl -sS -o /dev/null -w \'%{http_code}\' --connect-timeout 3 --max-time 8 \'http://127.0.0.1:11434/api/tags\' 2>/dev/null) || true',
    'echo "curl_127_11434=${hc:-}"'
  ].join('\n')
  try {
    const out = await runInWsl(script, 28000)
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  } catch (e) {
    return [
      `WSL diagnostic script failed (is Ubuntu installed and reachable?): ${
        e instanceof Error ? e.message : String(e)
      }`
    ]
  }
}

/**
 * WSL2: default route gateway is usually the Windows host (NAT).
 * More reliable than resolv.conf on some distros / mirrored networking setups.
 */
async function getWslDefaultGatewayIp(): Promise<string | null> {
  try {
    const out = await runInWsl(
      `PATH="/usr/sbin:/sbin:/usr/bin:/bin:$PATH" ip -4 route show default 2>/dev/null | awk '{print $3; exit}'`,
      6000
    )
    const ip = (out.trim().split(/\s+/)[0] ?? '').trim()
    return isUsableWslHostCandidate(ip) ? ip : null
  } catch {
    return null
  }
}

/**
 * WSL2: first `nameserver` in resolv.conf is typically the Windows host (NAT).
 */
export async function getWslWindowsHostIp(): Promise<string | null> {
  try {
    const out = await runInWsl(
      `grep -E '^nameserver[[:space:]]+' /etc/resolv.conf 2>/dev/null | awk '{print $2}'`,
      6000
    )
    for (const line of out.split(/\r?\n/)) {
      const ip = line.trim()
      if (isUsableWslHostCandidate(ip)) return ip
    }
    return null
  } catch {
    return null
  }
}

/** Best-effort Windows host IP as seen from WSL (for Ollama Windows app). */
export async function getWslWindowsGatewayIpRobust(): Promise<string | null> {
  const a = await getWslDefaultGatewayIp()
  if (a) return a
  const b = await getWslWindowsHostIp()
  if (b) return b
  return getWindowsWslVirtualSwitchHostIp()
}

/** System `curl.exe` (Windows 10+): sometimes succeeds when Node `http` fails (proxy/AV edge cases). */
function probeOllamaFromWindowsCurlExe(timeoutMs: number): Promise<boolean> {
  if (platform() !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    const child = spawn(
      'curl.exe',
      ['-sf', '--max-time', String(OLLAMA_WSL_CURL_MAX_SEC), 'http://127.0.0.1:11434/api/tags', '-o', 'NUL'],
      { windowsHide: true }
    )
    const killTimer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, timeoutMs)
    child.on('error', () => {
      clearTimeout(killTimer)
      resolve(false)
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      resolve(code === 0)
    })
  })
}

/**
 * True if Ollama answers on Windows loopback (Node `http` tries 127.0.0.1, localhost, ::1, then `curl.exe`).
 */
export async function probeOllamaFromWindowsNode(
  timeoutMs: number = OLLAMA_PROBE_TIMEOUT_MS,
  stepLog?: (msg: string) => void
): Promise<boolean> {
  for (const base of WINDOWS_OLLAMA_LOOPBACK_BASES) {
    stepLog?.(`Probe Windows (Node) → ${base}/api/tags`)
    if (await probeOllamaFromWindowsUrl(base, timeoutMs)) {
      stepLog?.('OK')
      return true
    }
    stepLog?.('failed')
  }
  stepLog?.('Probe Windows (curl.exe) → http://127.0.0.1:11434/api/tags')
  const ok = await probeOllamaFromWindowsCurlExe(Math.max(timeoutMs, 12000))
  stepLog?.(ok ? 'OK' : 'failed')
  return ok
}

/** Probe `http://host:11434/api/tags` from the Windows host (same as Electron main). */
export function probeOllamaFromWindowsUrl(baseUrl: string, timeoutMs = OLLAMA_PROBE_TIMEOUT_MS): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, '')
  const url = `${base}/api/tags`
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        const ok = res.statusCode === 200
        res.resume()
        resolve(ok)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(timeoutMs, () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

async function ollamaQuickReachableAnywhere(): Promise<boolean> {
  try {
    await runInWsl(
      `curl -sf --max-time 2 'http://127.0.0.1:11434/api/tags' -o /dev/null`,
      10000
    )
    return true
  } catch {
    /* empty */
  }
  if (platform() === 'win32') {
    if (await probeOllamaFromWindowsUrl('http://127.0.0.1:11434', 4000)) return true
  }
  return false
}

async function tryBootOllamaWindowsAndWsl(diag: (msg: string) => void): Promise<void> {
  if (platform() !== 'win32') return
  const exes = getWindowsOllamaExeCandidates()
  if (exes.length) {
    for (const exe of exes) {
      diag(`Starting Windows Ollama app: ${exe}`)
      try {
        spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
        break
      } catch {
        /* try next path */
      }
    }
  } else {
    diag('No Ollama.exe under LocalAppData/Program Files — install from https://ollama.com/download if you use Windows Ollama')
  }
  await sleep(5000)
  diag('WSL: if the `ollama` CLI exists, starting background `ollama serve` (common when systemd does not run the service)…')
  try {
    await runInWsl(WSL_BOOT_OLLAMA_SCRIPT, 35000)
  } catch (e) {
    diag(`WSL ollama serve helper: ${e instanceof Error ? e.message : String(e)}`)
  }
  await sleep(3500)
}

/**
 * All plausible Windows-side IPv4 addresses for WSL2 NAT (gateway often matches one of these).
 * Includes every vEthernet/WSL/Hyper-V adapter, not only the first match.
 */
function collectWindowsHostCandidatesForOllama(): string[] {
  if (platform() !== 'win32') return []
  const ips: string[] = []
  const ifs = networkInterfaces()
  for (const name of Object.keys(ifs)) {
    const key = name.toLowerCase()
    if (!key.includes('wsl') && !key.includes('hyper-v') && !key.includes('vethernet')) continue
    for (const addr of ifs[name] ?? []) {
      if (addr.internal) continue
      if (addr.family !== 'IPv4') continue
      if (isUsableWslHostCandidate(addr.address)) ips.push(addr.address)
    }
  }
  return [...new Set(ips)]
}

export type OllamaWslEndpointResolution = {
  baseUrl: string
  reachable: boolean
  via: 'wsl-localhost' | 'windows-host' | 'windows-host-guess' | 'fallback-localhost'
  /**
   * Ollama responds on Windows 127.0.0.1:11434 but not on the WSL gateway / vEthernet IPs.
   * Typical cause: Ollama listens only on loopback — set OLLAMA_HOST=0.0.0.0:11434 and restart Ollama.
   */
  likelyOllamaWindowsLocalhostOnly?: boolean
  /**
   * No /api/tags on 11434 from WSL localhost, WSL→gateway tries, or Windows loopback (Electron).
   * Do not pretend a Windows NAT IP will work — Ollama is probably not running.
   */
  noOllamaResponded?: boolean
}

/**
 * Resolve Ollama base URL for `openclaw onboard` running **inside WSL**.
 * - Ollama in Ubuntu → http://127.0.0.1:11434
 * - Ollama Windows app → http://<windows-host-from-wsl>:11434 (NOT 127.0.0.1 in WSL)
 */
export async function resolveOllamaBaseUrlForWsl(options?: {
  /** Extra lines for the install log (probes and outcomes). */
  detailLog?: (line: string) => void
}): Promise<OllamaWslEndpointResolution> {
  const dl = options?.detailLog
  const diag = (msg: string): void => {
    dl?.(`[Ollama] ${msg}`)
  }

  const localhost = 'http://127.0.0.1:11434'

  if (platform() === 'win32') {
    const warm = await ollamaQuickReachableAnywhere()
    if (!warm) {
      diag('Port 11434 was quiet — auto-starting Ollama (Windows app + WSL `ollama serve` if installed)…')
      await tryBootOllamaWindowsAndWsl(diag)
    }
  }

  diag(`Probe WSL → ${localhost}/api/tags (same network as openclaw onboard)`)
  let wslLoopbackUrl: string | null = null
  if (await probeOllamaInWsl(localhost)) {
    wslLoopbackUrl = localhost
    diag('WSL 127.0.0.1: OK')
  } else {
    diag('WSL 127.0.0.1: no response')
    const altLocal = 'http://localhost:11434'
    diag(`Probe WSL → ${altLocal}/api/tags (hostname localhost)`)
    if (await probeOllamaInWsl(altLocal)) {
      wslLoopbackUrl = altLocal
      diag('OK (mirrored networking or Ollama on this name)')
    } else {
      diag('failed')
    }
  }
  if (wslLoopbackUrl) {
    return { baseUrl: wslLoopbackUrl, reachable: true, via: 'wsl-localhost' }
  }
  diag('WSL loopback: no Ollama on 11434 — will try OLLAMA_HOST, Windows host IPs, then probe from Windows')

  const envBase = normalizeOllamaHostEnvToBaseUrl()
  if (envBase) {
    const redundant =
      envBase === localhost ||
      envBase === 'http://localhost:11434' ||
      envBase.replace('localhost', '127.0.0.1') === localhost
    if (!redundant) {
      diag(`OLLAMA_HOST is set for this app — probing ${envBase} from WSL (openclaw runs in WSL)`)
      diag(`Probe WSL → ${envBase}/api/tags`)
      if (await probeOllamaInWsl(envBase)) {
        diag('OK')
        return { baseUrl: envBase, reachable: true, via: 'wsl-localhost' }
      }
      diag('failed')
    }
  }

  const gatewayIp = await getWslWindowsGatewayIpRobust()
  const fromAdapters = collectWindowsHostCandidatesForOllama()
  const hostCandidates = [...new Set([...(gatewayIp ? [gatewayIp] : []), ...fromAdapters])]
  diag(
    hostCandidates.length
      ? `Windows-host IPs to try (WSL→Windows): ${hostCandidates.join(', ')}`
      : 'No Windows NAT/gateway IP found (unexpected on WSL2)'
  )

  for (const ip of hostCandidates) {
    const winUrl = `http://${ip}:11434`
    diag(`Probe WSL → ${winUrl}/api/tags`)
    const ok = await probeOllamaInWsl(winUrl)
    diag(ok ? 'OK' : 'failed')
    if (ok) {
      return { baseUrl: winUrl, reachable: true, via: 'windows-host' }
    }
  }

  let windowsLoopbackOk = false
  if (platform() === 'win32') {
    windowsLoopbackOk = await probeOllamaFromWindowsNode(OLLAMA_PROBE_TIMEOUT_MS, diag)
    if (!windowsLoopbackOk) {
      diag('Windows: still no Ollama on port 11434 — open the Ollama app (tray) or run `ollama serve` in WSL, then retry.')
    }
  }

  // Ollama Windows app: often works on 127.0.0.1 from Electron but not on NAT IP (binds loopback only).
  if (platform() === 'win32' && windowsLoopbackOk && hostCandidates.length > 0) {
    for (const ip of hostCandidates) {
      const winUrl = `http://${ip}:11434`
      diag(`Probe Windows → ${winUrl}/api/tags`)
      const ok = await probeOllamaFromWindowsUrl(winUrl, OLLAMA_PROBE_TIMEOUT_MS)
      diag(ok ? 'OK' : 'failed')
      if (ok) {
        return { baseUrl: winUrl, reachable: true, via: 'windows-host' }
      }
    }
    const first = hostCandidates[0]
    return {
      baseUrl: `http://${first}:11434`,
      reachable: false,
      via: 'windows-host-guess',
      likelyOllamaWindowsLocalhostOnly: true
    }
  }

  if (platform() === 'win32' && windowsLoopbackOk && hostCandidates.length === 0) {
    diag('Ollama on Windows loopback but no gateway IP — falling back to http://127.0.0.1:11434 for CLI (may fail from WSL)')
    return {
      baseUrl: localhost,
      reachable: false,
      via: 'fallback-localhost',
      likelyOllamaWindowsLocalhostOnly: true
    }
  }

  // Windows loopback failed: Ollama is almost certainly not running on this PC on 11434.
  // Using a WSL gateway URL here only confuses users (onboard still fails the same way).
  if (platform() === 'win32' && !windowsLoopbackOk && hostCandidates.length > 0) {
    diag(
      'Windows loopback probes (Node + curl.exe) did not get Ollama on 11434 — start the Ollama app from the tray or `ollama serve` in WSL. Using WSL 127.0.0.1 for onboard URL.'
    )
    return {
      baseUrl: localhost,
      reachable: false,
      via: 'fallback-localhost',
      noOllamaResponded: true
    }
  }

  if (hostCandidates.length) {
    diag(`Using first candidate without successful probe: http://${hostCandidates[0]}:11434`)
    return {
      baseUrl: `http://${hostCandidates[0]}:11434`,
      reachable: false,
      via: 'windows-host-guess'
    }
  }

  diag('No host candidates; using WSL localhost URL (expected to fail if Ollama is Windows-only)')
  return { baseUrl: localhost, reachable: false, via: 'fallback-localhost' }
}

/** Strip `ollama/` prefix from wizard model id for `--custom-model-id`. */
export function ollamaModelTagForOnboard(modelId: string | undefined): string | undefined {
  const m = modelId?.trim()
  if (!m) return undefined
  if (m.startsWith('ollama/')) return m.slice(7) || undefined
  return m
}
