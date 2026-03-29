import { spawn } from 'child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createWriteStream } from 'fs'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync
} from 'fs'
import { randomBytes } from 'crypto'
import { basename, join, dirname, resolve } from 'path'
import { tmpdir } from 'os'
import { finished } from 'stream/promises'
import { fileURLToPath } from 'url'
import extract from 'extract-zip'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

type InstallManifest = { appZipUrl: string }

/** GitHub release v1.1.02 has asset OpenClaw-1.1.2-win.zip; ...1.1.02-win.zip 404s. */
function normalizeKnownBrokenGithubZipUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return url
    const parts = u.pathname.split('/').filter(Boolean)
    const d = parts.indexOf('download')
    if (d < 0 || parts.length < d + 3) return url
    if (
      parts[0] === 'WalnutThinh' &&
      parts[1] === 'OpenClaw' &&
      parts[d + 1] === 'v1.1.02' &&
      parts[d + 2] === 'OpenClaw-1.1.02-win.zip'
    ) {
      parts[d + 2] = 'OpenClaw-1.1.2-win.zip'
      u.pathname = `/${parts.join('/')}`
      return u.toString()
    }
  } catch {
    return url
  }
  return url
}

function readInstallManifest(): InstallManifest | null {
  if (!app.isPackaged) return null
  const p = join(process.resourcesPath, 'install-manifest.json')
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as unknown
    if (!j || typeof j !== 'object') return null
    const url = (j as InstallManifest).appZipUrl
    if (typeof url !== 'string') return null
    const u = url.trim()
    if (u.startsWith('https://') || u.startsWith('http://'))
      return { appZipUrl: normalizeKnownBrokenGithubZipUrl(u) }
  } catch {
    /* ignore */
  }
  return null
}

function devPayloadZipPath(): string {
  return join(app.getAppPath(), 'payload', 'openclaw-app.zip')
}

type Source =
  | { kind: 'local'; path: string }
  | { kind: 'remote'; url: string }
  | { kind: 'none'; reason: string }

function resolveInstallSource(): Source {
  if (!app.isPackaged) {
    const local = devPayloadZipPath()
    if (existsSync(local)) return { kind: 'local', path: local }
    const envUrl = process.env.OPENCLAW_APP_ZIP_URL?.trim()
    if (envUrl) return { kind: 'remote', url: normalizeKnownBrokenGithubZipUrl(envUrl) }
    return { kind: 'none', reason: 'DEV_NO_ZIP' }
  }
  const man = readInstallManifest()
  if (man?.appZipUrl && !/REPLACE_ME|PLACEHOLDER|OPENCLAW_APP_ZIP_REPLACE_ME/i.test(man.appZipUrl)) {
    return { kind: 'remote', url: man.appZipUrl }
  }
  return { kind: 'none', reason: 'NO_MANIFEST' }
}

async function downloadToFile(
  urlStr: string,
  destPath: string,
  wc: Electron.WebContents,
  onProgress: (n: { received: number; total?: number }) => void
): Promise<void> {
  const res = await fetch(urlStr, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(
      `Download failed (HTTP ${res.status}). URL: ${urlStr}. Check the release tag, asset name, and your network.`
    )
  }
  const cl = res.headers.get('content-length')
  const total = cl ? parseInt(cl, 10) : undefined
  const body = res.body
  if (!body) throw new Error('Empty download response')

  const reader = body.getReader()
  const ws = createWriteStream(destPath)
  let received = 0
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
    if (!wc.isDestroyed()) {
      onProgress({ received, total })
    }
    ws.end()
    await finished(ws)
  } catch (e) {
    ws.destroy()
    try {
      unlinkSync(destPath)
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** electron-builder zip has one top-level folder (e.g. OpenClaw-win32-x64); flatten so OpenClaw.exe is in install root. */
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
  if (existsSync(join(root, 'OpenClaw.exe'))) return
  const entries = readdirSync(root, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory())
  if (dirs.length !== 1) return
  const inner = join(root, dirs[0].name)
  if (!existsSync(join(inner, 'OpenClaw.exe'))) return
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

  mainWindow.setTitle('OpenClaw Setup')

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
    const targetRoot = resolve(parentDir, 'OpenClaw')
    const wc = evt.sender
    let tempZip: string | null = null
    try {
      mkdirSync(targetRoot, { recursive: true })
      let zipPath: string
      if (src.kind === 'local') {
        zipPath = src.path
      } else {
        const sub = join(tmpdir(), `openclaw-setup-${randomBytes(8).toString('hex')}`)
        mkdirSync(sub, { recursive: true })
        tempZip = join(sub, 'openclaw-app.zip')
        if (!wc.isDestroyed()) {
          wc.send('setup:install-phase', { phase: 'download' as const })
        }
        await downloadToFile(src.url, tempZip, wc, (p) => {
          if (!wc.isDestroyed()) {
            wc.send('setup:download-progress', p)
          }
        })
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
      const exe = join(targetRoot, 'OpenClaw.exe')
      if (!existsSync(exe)) {
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
