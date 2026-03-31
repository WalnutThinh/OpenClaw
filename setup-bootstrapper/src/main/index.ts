import { spawn } from 'child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createReadStream, createWriteStream } from 'fs'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync
} from 'fs'
import { createHash, randomBytes } from 'crypto'
import { basename, join, dirname, resolve } from 'path'
import { tmpdir } from 'os'
import { finished } from 'stream/promises'
import { fileURLToPath } from 'url'
import extract from 'extract-zip'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Installed app folder + exe (matches electron-builder `productName` / `executableName`). */
const DESKTOP_APP_DIR = 'EClaw'
const DESKTOP_APP_EXE = 'EClaw.exe'

let mainWindow: BrowserWindow | null = null

type InstallManifest = { appZipUrl?: string; latestJsonUrl?: string }
type LatestJson = {
  version?: string
  url?: string
  sha256?: string
  size?: number
}

function normalizeKnownBrokenGithubZipUrl(url: string): string {
  try {
    if (url.startsWith('github-release-asset://')) return url
    const u = new URL(url)
    if (u.hostname !== 'github.com') return url
    const parts = u.pathname.split('/').filter(Boolean)
    const d = parts.indexOf('download')
    if (d < 0 || parts.length < d + 3) return url
    const file = parts[d + 2]
    const m = /^([\w.-]+)-(\d+)\.(\d+)\.0(\d+)-win\.zip$/i.exec(file)
    if (!m) return url
    const fixed = `${m[1]}-${m[2]}.${m[3]}.${m[4]}-win.zip`
    if (fixed === file) return url
    {
      parts[d + 2] = fixed
      u.pathname = `/${parts.join('/')}`
      return u.toString()
    }
  } catch {
    return url
  }
  return url
}

function resolveGithubReleaseAssetCandidates(schemeUrl: string): string[] {
  // github-release-asset://OWNER/REPO/AssetFile.zip
  try {
    const raw = schemeUrl.replace(/^github-release-asset:\/\//, '')
    const [owner, repo, asset] = raw.split('/')
    if (!owner || !repo || !asset) return []
    const semverMatch = /^[\w.-]+-(\d+)\.(\d+)\.(\d+)-win\.zip$/i.exec(asset)
    const x = semverMatch?.[1]
    const y = semverMatch?.[2]
    const z = semverMatch?.[3]
    const tags = new Set<string>()
    if (x && y && z) {
      tags.add(`v${x}.${y}.${z}`)
      tags.add(`v${x}.${y}.${z.padStart(2, '0')}`)
    }
    const candidates: string[] = []
    for (const tag of tags) {
      candidates.push(`https://github.com/${owner}/${repo}/releases/download/${tag}/${asset}`)
    }
    if (candidates.length === 0) {
      candidates.push(`https://github.com/${owner}/${repo}/releases/latest/download/${asset}`)
    }
    return candidates
  } catch {
    return []
  }
}

function readInstallManifest(): InstallManifest | null {
  if (!app.isPackaged) return null
  const p = join(process.resourcesPath, 'install-manifest.json')
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as unknown
    if (!j || typeof j !== 'object') return null
    const fromLatest = typeof (j as InstallManifest).latestJsonUrl === 'string'
      ? (j as InstallManifest).latestJsonUrl?.trim()
      : ''
    const fromZip = typeof (j as InstallManifest).appZipUrl === 'string'
      ? (j as InstallManifest).appZipUrl?.trim()
      : ''
    const out: InstallManifest = {}
    if (fromLatest && (fromLatest.startsWith('https://') || fromLatest.startsWith('http://'))) {
      out.latestJsonUrl = fromLatest
    }
    if (fromZip) {
      if (fromZip.startsWith('github-release-asset://')) out.appZipUrl = fromZip
      else if (fromZip.startsWith('https://') || fromZip.startsWith('http://'))
        out.appZipUrl = normalizeKnownBrokenGithubZipUrl(fromZip)
    }
    if (out.latestJsonUrl || out.appZipUrl) return out
  } catch {
    /* ignore */
  }
  return null
}

function resolveLatestJsonUrl(manifest: InstallManifest | null): string | null {
  const env = process.env.OPENCLAW_LATEST_JSON_URL?.trim()
  if (env) return env
  const man = manifest as InstallManifest & { latestJsonUrl?: string }
  const fromManifest = man.latestJsonUrl?.trim()
  if (fromManifest) return fromManifest
  return null
}

function devPayloadZipPath(): string {
  return join(app.getAppPath(), 'payload', 'openclaw-app.zip')
}

type Source =
  | { kind: 'local'; path: string }
  | { kind: 'remote'; url: string; viaLatestJson: boolean; fallbackZipUrl?: string }
  | { kind: 'none'; reason: string }

function resolveInstallSource(): Source {
  if (!app.isPackaged) {
    const local = devPayloadZipPath()
    if (existsSync(local)) return { kind: 'local', path: local }
    const latestJsonUrl = process.env.OPENCLAW_LATEST_JSON_URL?.trim()
    if (latestJsonUrl)
      return {
        kind: 'remote',
        url: latestJsonUrl,
        viaLatestJson: true,
        fallbackZipUrl: process.env.OPENCLAW_APP_ZIP_URL?.trim() || undefined
      }
    const envUrl = process.env.OPENCLAW_APP_ZIP_URL?.trim()
    if (envUrl) return { kind: 'remote', url: normalizeKnownBrokenGithubZipUrl(envUrl), viaLatestJson: false }
    return { kind: 'none', reason: 'DEV_NO_ZIP' }
  }
  const man = readInstallManifest()
  const latestJsonUrl = resolveLatestJsonUrl(man)
  if (latestJsonUrl) {
    return {
      kind: 'remote',
      url: latestJsonUrl,
      viaLatestJson: true,
      fallbackZipUrl: man?.appZipUrl
    }
  }
  if (man?.appZipUrl && !/REPLACE_ME|PLACEHOLDER|OPENCLAW_APP_ZIP_REPLACE_ME/i.test(man.appZipUrl)) {
    return { kind: 'remote', url: man.appZipUrl, viaLatestJson: false }
  }
  return { kind: 'none', reason: 'NO_MANIFEST' }
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const h = createHash('sha256')
    const rs = createReadStream(filePath)
    rs.on('error', rejectHash)
    rs.on('data', (chunk) => h.update(chunk))
    rs.on('end', () => resolveHash(h.digest('hex')))
  })
}

async function resolveLatestDownload(latestJsonUrl: string): Promise<{ downloadUrl: string; sha256?: string; size?: number }> {
  const res = await fetch(latestJsonUrl, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Cannot fetch latest.json (HTTP ${res.status}). URL: ${latestJsonUrl}`)
  }
  const j = (await res.json()) as LatestJson
  const raw = typeof j.url === 'string' ? j.url.trim() : ''
  if (!raw) {
    throw new Error(`latest.json is missing "url". URL: ${latestJsonUrl}`)
  }
  const normalized = raw.startsWith('github-release-asset://')
    ? raw
    : normalizeKnownBrokenGithubZipUrl(raw)
  const sha = typeof j.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(j.sha256.trim()) ? j.sha256.trim() : undefined
  const size = typeof j.size === 'number' && Number.isFinite(j.size) && j.size > 0 ? Math.floor(j.size) : undefined
  return { downloadUrl: normalized, sha256: sha, size }
}

async function downloadToFile(
  urlStr: string,
  destPath: string,
  wc: Electron.WebContents,
  onProgress: (n: { received: number; total?: number }) => void
): Promise<void> {
  const tryUrls =
    urlStr.startsWith('github-release-asset://') ? resolveGithubReleaseAssetCandidates(urlStr) : [urlStr]
  if (tryUrls.length === 0) throw new Error(`Download failed. Bad URL: ${urlStr}`)

  for (let i = 0; i < tryUrls.length; i++) {
    const attemptUrl = tryUrls[i]
    const existing = existsSync(destPath) ? statSync(destPath).size : 0
    const headers: Record<string, string> = {}
    if (existing > 0) headers.Range = `bytes=${existing}-`
    const res = await fetch(attemptUrl, { redirect: 'follow', headers })
    if (!res.ok) {
      if (res.status === 404 && i < tryUrls.length - 1) continue
      throw new Error(
        `Download failed (HTTP ${res.status}). URL: ${attemptUrl}. Check the release tag, asset name, and your network.`
      )
    }
    const resumed = res.status === 206 && existing > 0
    const total = (() => {
      const cr = res.headers.get('content-range')
      if (cr) {
        const m = /\/(\d+)$/.exec(cr)
        if (m) return parseInt(m[1], 10)
      }
      const cl = res.headers.get('content-length')
      if (!cl) return undefined
      const n = parseInt(cl, 10)
      return resumed ? existing + n : n
    })()
    const body = res.body
    if (!body) throw new Error('Empty download response')

    const reader = body.getReader()
    const ws = createWriteStream(destPath, resumed ? { flags: 'a' } : { flags: 'w' })
    let received = resumed ? existing : 0
    let lastAt = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value?.byteLength) {
          received += value.byteLength
          await new Promise<void>((resolveWrite, rejectWrite) => {
            ws.write(Buffer.from(value), (err) => (err ? rejectWrite(err) : resolveWrite()))
          })
          const now = Date.now()
          if (now - lastAt > 280) {
            lastAt = now
            if (!wc.isDestroyed()) {
              onProgress({ received, total })
            }
          }
        }
      }
      if (!wc.isDestroyed()) onProgress({ received, total })
      ws.end()
      await finished(ws)
      return
    } catch (e) {
      ws.destroy()
      try {
        unlinkSync(destPath)
      } catch {
        /* ignore */
      }
      if (i < tryUrls.length - 1) continue
      throw e
    }
  }
}

/** electron-builder zip has one top-level folder (e.g. EClaw-win32-x64); flatten so EClaw.exe is in install root. */
function resolveWindowIcon(): string | undefined {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'icon.ico'))
  }
  candidates.push(join(__dirname, '../../build/icon.ico'))
  candidates.push(join(app.getAppPath(), 'build', 'icon.ico'))
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function flattenSingleAppFolder(root: string): void {
  if (existsSync(join(root, DESKTOP_APP_EXE)) || existsSync(join(root, 'OpenClaw.exe'))) return
  const entries = readdirSync(root, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory())
  if (dirs.length !== 1) return
  const inner = join(root, dirs[0].name)
  const hasInnerExe =
    existsSync(join(inner, DESKTOP_APP_EXE)) || existsSync(join(inner, 'OpenClaw.exe'))
  if (!hasInnerExe) return
  for (const name of readdirSync(inner)) {
    renameSync(join(inner, name), join(root, name))
  }
  rmdirSync(inner)
}

function createWindow(): void {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    frame: false,
    width: 520,
    height: 620,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f3ed',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.setTitle('EClaw Setup')

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Windows built-in bsdtar is usually much faster than extract-zip for huge entries (e.g. app.asar). */
function tryExtractWindowsTar(zipPath: string, targetRoot: string, wc: Electron.WebContents): Promise<boolean> {
  if (!wc.isDestroyed()) {
    wc.send('setup:extract-progress', { native: true })
  }
  return new Promise((resolve) => {
    const child = spawn('tar', ['-xf', zipPath, '-C', targetRoot], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let errBuf = ''
    child.stderr?.on('data', (chunk) => {
      errBuf += String(chunk)
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => {
      if (code !== 0 && errBuf) {
        console.warn(`[openclaw-setup] tar extract exited ${code}: ${errBuf.slice(0, 400)}`)
      }
      resolve(code === 0)
    })
  })
}

function runExtractWithExtractZip(zipPath: string, targetRoot: string, wc: Electron.WebContents): Promise<void> {
  let fileCount = 0
  let lastProgressAt = 0
  let currentFile: string | undefined
  let lastSentFile: string | undefined
  const pushProgress = (): void => {
    const now = Date.now()
    const fileChanged = currentFile !== lastSentFile
    if (!fileChanged && now - lastProgressAt < 350 && fileCount % 30 !== 0) return
    lastProgressAt = now
    lastSentFile = currentFile
    if (!wc.isDestroyed()) {
      wc.send('setup:extract-progress', { files: fileCount, currentFile })
    }
  }
  return extract(zipPath, {
    dir: targetRoot,
    onEntry: (entry) => {
      fileCount += 1
      currentFile = basename(entry.fileName.replace(/\\/g, '/'))
      pushProgress()
    }
  })
}

async function runExtract(zipPath: string, targetRoot: string, wc: Electron.WebContents): Promise<void> {
  if (process.platform === 'win32') {
    const ok = await tryExtractWindowsTar(zipPath, targetRoot, wc)
    if (ok) return
    if (!wc.isDestroyed()) {
      wc.send('setup:extract-progress', { native: false })
    }
  }
  await runExtractWithExtractZip(zipPath, targetRoot, wc)
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('setup:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('setup:payload-info', () => {
    const s = resolveInstallSource()
    return {
      ready: s.kind !== 'none',
      mode: s.kind === 'local' ? ('local' as const) : s.kind === 'remote' ? ('download' as const) : ('none' as const),
      remoteUrl: s.kind === 'remote' ? s.url : undefined,
      remoteMode: s.kind === 'remote' ? (s.viaLatestJson ? ('latest-json' as const) : ('zip-url' as const)) : undefined,
      reason: s.kind === 'none' ? s.reason : undefined
    }
  })

  ipcMain.handle('setup:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const r = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose install location',
      buttonLabel: 'Select folder'
    })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('setup:install', async (evt, parentDir: string) => {
    const src = resolveInstallSource()
    if (src.kind === 'none') {
      return {
        ok: false as const,
        error:
          src.reason === 'NO_MANIFEST'
            ? 'Missing install-manifest.json (rebuild with npm run build:win-setup).'
            : 'Development: add payload/openclaw-app.zip or set OPENCLAW_APP_ZIP_URL.'
      }
    }
    if (!parentDir || typeof parentDir !== 'string') {
      return { ok: false as const, error: 'INVALID_DIR' }
    }
    const targetRoot = resolve(parentDir, DESKTOP_APP_DIR)
    const wc = evt.sender
    let tempZip: string | null = null
    try {
      mkdirSync(targetRoot, { recursive: true })
      let zipPath: string
      if (src.kind === 'local') {
        zipPath = src.path
      } else {
        let downloadUrl = src.url
        let expectedSha256: string | undefined
        let expectedSize: number | undefined
        if (src.viaLatestJson) {
          try {
            const latest = await resolveLatestDownload(src.url)
            downloadUrl = latest.downloadUrl
            expectedSha256 = latest.sha256
            expectedSize = latest.size
          } catch (e) {
            if (!src.fallbackZipUrl) throw e
            downloadUrl = src.fallbackZipUrl.startsWith('github-release-asset://')
              ? src.fallbackZipUrl
              : normalizeKnownBrokenGithubZipUrl(src.fallbackZipUrl)
            expectedSha256 = undefined
            expectedSize = undefined
          }
        }
        const sub = join(tmpdir(), `openclaw-setup-${randomBytes(8).toString('hex')}`)
        mkdirSync(sub, { recursive: true })
        tempZip = join(sub, 'openclaw-app.zip')
        if (!wc.isDestroyed()) {
          wc.send('setup:install-phase', { phase: 'download' as const })
        }
        await downloadToFile(downloadUrl, tempZip, wc, (p) => {
          if (!wc.isDestroyed()) {
            wc.send('setup:download-progress', p)
          }
        })
        if (expectedSize && existsSync(tempZip)) {
          const got = statSync(tempZip).size
          if (got !== expectedSize) {
            throw new Error(`Download size mismatch. Expected ${expectedSize} bytes, got ${got} bytes.`)
          }
        }
        if (expectedSha256) {
          const gotSha = await sha256File(tempZip)
          if (gotSha.toLowerCase() !== expectedSha256.toLowerCase()) {
            throw new Error(`Checksum mismatch (sha256). Expected ${expectedSha256}, got ${gotSha}.`)
          }
        }
        zipPath = tempZip
      }
      if (!wc.isDestroyed()) {
        wc.send('setup:install-phase', { phase: 'extract' as const })
      }
      await runExtract(zipPath, targetRoot, wc)
      flattenSingleAppFolder(targetRoot)
      if (!wc.isDestroyed()) {
        wc.send('setup:extract-progress', { done: true })
      }
      const exe = existsSync(join(targetRoot, DESKTOP_APP_EXE))
        ? join(targetRoot, DESKTOP_APP_EXE)
        : existsSync(join(targetRoot, 'OpenClaw.exe'))
          ? join(targetRoot, 'OpenClaw.exe')
          : null
      if (!exe) {
        return { ok: false as const, error: 'EXTRACT_INCOMPLETE' }
      }
      return { ok: true as const, installPath: targetRoot, exePath: exe }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    } finally {
      if (tempZip) {
        try {
          unlinkSync(tempZip)
          rmdirSync(dirname(tempZip))
        } catch {
          /* ignore */
        }
      }
    }
  })

  ipcMain.handle('setup:open-path', async (_evt, p: string) => {
    const err = await shell.openPath(p)
    return err || null
  })

  ipcMain.handle('setup:open-app-and-close', async (_evt, p: string) => {
    if (typeof p !== 'string' || !p.trim()) return 'INVALID_PATH'
    const err = await shell.openPath(p.trim())
    if (!err) {
      mainWindow?.close()
    }
    return err || null
  })

  ipcMain.handle('setup:reveal', async (_evt, p: string) => {
    shell.showItemInFolder(p)
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
