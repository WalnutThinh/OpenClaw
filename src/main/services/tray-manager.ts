import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { getAppIconNativeImage, resolveTrayTemplatePath } from '../app-paths'
import { getGatewayStatus, startGateway, stopGateway } from './gateway'
import { t } from '../../shared/i18n/main'
import { existsSync } from 'fs'

let tray: Tray | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastStatus: 'running' | 'stopped' = 'stopped'

interface TrayDeps {
  getWin: () => BrowserWindow | null
  onQuit: () => void
}

let deps: TrayDeps | null = null

const createTrayIcon = (): Electron.NativeImage => {
  if (process.platform === 'darwin') {
    const templatePath = resolveTrayTemplatePath()
    if (existsSync(templatePath)) {
      try {
        const img = nativeImage.createFromPath(templatePath)
        if (!img.isEmpty()) {
          img.setTemplateImage(true)
          return img
        }
      } catch {
        // fallback below
      }
    }
  }
  // Windows/Linux (or macOS fallback): same icon as taskbar/window
  const img = getAppIconNativeImage()
  if (img.isEmpty()) return nativeImage.createEmpty()
  /* Windows tray: 32×32 scales better in the notification area than 16×16-only. */
  const dim = process.platform === 'win32' ? 32 : 16
  return img.resize({ width: dim, height: dim })
}

const buildMenu = (status: 'running' | 'stopped'): Menu =>
  Menu.buildFromTemplate([
    {
      label: t('tray.open'),
      click: () => {
        const win = deps?.getWin()
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: status === 'running' ? t('tray.gwRunning') : t('tray.gwStopped'),
      enabled: false
    },
    {
      label: t('tray.gwStart'),
      enabled: status === 'stopped',
      click: async () => {
        try {
          await startGateway()
        } catch {
          /* status will be reflected in refreshStatus */
        }
        await refreshStatus()
      }
    },
    {
      label: t('tray.gwStop'),
      enabled: status === 'running',
      click: async () => {
        await stopGateway()
        await refreshStatus()
      }
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        deps?.onQuit()
      }
    }
  ])

const refreshStatus = async (): Promise<void> => {
  const status = await getGatewayStatus()
  updateMenu(status)

  if (status !== lastStatus) {
    lastStatus = status
    const win = deps?.getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('gateway:status-changed', status)
    }
    /* Intentionally no OS toast: polling flips gateway state often and spams Windows notifications. */
  }
}

const updateMenu = (status: 'running' | 'stopped'): void => {
  if (!tray) return
  tray.setContextMenu(buildMenu(status))
  tray.setToolTip(status === 'running' ? t('tray.tooltipRunning') : t('tray.tooltipStopped'))
}

export const createTray = (trayDeps: TrayDeps): void => {
  deps = trayDeps
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('EClaw')
  updateMenu('stopped')

  if (process.platform === 'darwin') {
    tray.on('click', () => {
      const win = deps?.getWin()
      if (win) {
        win.show()
        win.focus()
      }
    })
  }
}

export const rebuildTrayMenu = (): void => {
  updateMenu(lastStatus)
}

export const startPolling = (): void => {
  if (pollTimer) return
  // Run once immediately, then poll every 10 seconds
  refreshStatus()
  pollTimer = setInterval(refreshStatus, 10_000)
}

export const stopPolling = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export const destroyTray = (): void => {
  stopPolling()
  if (tray) {
    tray.destroy()
    tray = null
  }
  deps = null
}

export const isGatewayRunning = (): boolean => lastStatus === 'running'
