import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'

/* Windows toast / shell may show package.json "name" otherwise (e.g. openclaw-enchante). */
app.setName('EClaw')
import { registerIpcHandlers, getSavedLocale } from './ipc-handlers'
import { createTray, startPolling, destroyTray } from './services/tray-manager'
import { setupAutoUpdater, checkForUpdates } from './services/updater'
import { startGateway } from './services/gateway'
import { initI18nMain } from '../shared/i18n/main'
import { getAppIconNativeImage } from './app-paths'
import { readAppSettings, writeAppSettings } from './services/app-settings'

/*
 * Windows: must call before `ready` or the shell may pin a generic taskbar icon.
 * Match @electron-toolkit/utils: dev uses electron.exe path to avoid wrong grouping.
 */
if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.enchante.eclaw' : process.execPath)
}

let ipcRegistered = false
let mainWindow: BrowserWindow | null = null
let isQuitting = false

const getWin = (): BrowserWindow | null => mainWindow

/**
 * Windows taskbar: NativeImage when Chromium decodes the asset; else packaged `app.ico` path string
 * so the shell can still load the same icon as the .exe/shortcuts when buffer decode returns empty.
 */
function getWindowsWindowIcon(): Electron.NativeImage | string | null {
  const img = getAppIconNativeImage()
  if (!img.isEmpty()) return img
  if (app.isPackaged) {
    const ico = join(process.resourcesPath, 'app.ico')
    if (existsSync(ico)) return ico
  }
  return null
}

function createWindow(): void {
  const startHidden =
    app.getLoginItemSettings().wasOpenedAsHidden || process.argv.includes('--hidden')

  mainWindow = new BrowserWindow({
    /* Compact profile-picker–style frame (Chrome picker is ~900–1000px wide) */
    width: 1024,
    height: 700,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    /* hiddenInset is macOS-only; on Windows it can break the taskbar/window icon. */
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 16 }
        }
      : {}),
    /* Windows/Linux: taskbar + window icon (avoid wrong relative path from ?asset in packaged app) */
    ...(process.platform === 'win32'
      ? (() => {
          const winIcon = getWindowsWindowIcon()
          return winIcon == null ? {} : { icon: winIcon }
        })()
      : process.platform !== 'darwin'
        ? (() => {
            const img = getAppIconNativeImage()
            return img.isEmpty() ? {} : { icon: img }
          })()
        : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.setTitle('EClaw')

  mainWindow.on('ready-to-show', () => {
    /* Windows/Linux: re-apply icon when shell is ready (fixes generic taskbar tile in some builds). */
    if (mainWindow && process.platform === 'win32') {
      const winIcon = getWindowsWindowIcon()
      if (winIcon != null) mainWindow.setIcon(winIcon)
    } else if (mainWindow && process.platform !== 'darwin') {
      const iconImg = getAppIconNativeImage()
      if (!iconImg.isEmpty()) mainWindow.setIcon(iconImg)
    }
    if (!startHidden) mainWindow?.show()
  })

  // Close window → stay in tray (not a real quit)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      const isOpenClawDashboard =
        url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')
      if (['https:', 'tg:'].includes(url.protocol) || isOpenClawDashboard) {
        shell.openExternal(details.url)
      }
    } catch {
      /* invalid URL — ignore */
    }
    return { action: 'deny' }
  })

  if (!ipcRegistered) {
    registerIpcHandlers(getWin)
    ipcRegistered = true
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && process.platform === 'win32') {
      const winIcon = getWindowsWindowIcon()
      if (winIcon != null) mainWindow.setIcon(winIcon)
    } else if (mainWindow && process.platform !== 'darwin') {
      const iconImg = getAppIconNativeImage()
      if (!iconImg.isEmpty()) mainWindow.setIcon(iconImg)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Auto-start Gateway when launched hidden
  if (startHidden) {
    startGateway().catch(() => {})
  }
}

app.on('before-quit', () => {
  isQuitting = true
})

app.whenReady().then(async () => {
  await initI18nMain(getSavedLocale())
  /* Re-apply after ready so @electron-toolkit/utils rules match (dev vs packaged). */
  electronApp.setAppUserModelId('com.enchante.eclaw')

  // Windows packaged app: enable auto-start by default on first run.
  if (process.platform === 'win32' && app.isPackaged) {
    const settings = readAppSettings()
    const initialized = settings.autoLaunchInitialized === true
    if (!initialized) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        args: ['--hidden']
      })
      writeAppSettings({ autoLaunchInitialized: true, autoLaunchEnabled: true })
    }
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // System tray
  createTray({
    getWin,
    onQuit: async () => {
      isQuitting = true
      app.quit()
    }
  })
  startPolling()

  // Auto update
  setupAutoUpdater(getWin)
  setTimeout(checkForUpdates, 5000)

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
})

// Stay in tray — keep app alive even when all windows are closed
app.on('window-all-closed', () => {
  // Do not quit in tray mode
})

app.on('quit', () => {
  destroyTray()
})
