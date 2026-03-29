import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import { platform } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import i18nMain, { initI18nMain } from '../shared/i18n/main'
import { rebuildTrayMenu } from './services/tray-manager'
import {
  checkEnvironment,
  checkOllamaWizardDiskSpace,
  checkOpenclawUpdate,
  getWslWindowsSystemDriveDiskHint
} from './services/env-checker'
import { checkPort, runFixerFix } from './services/troubleshooter'
import {
  installNodeMac,
  installOpenClaw,
  installWsl,
  installNodeWsl,
  installPythonWsl,
  installOpenClawWsl,
  installOllamaMac,
  installOllamaLinux,
  applyOllamaModelsEnvWsl,
  ensureOllamaApiListeningWsl
} from './services/installer'
import type { OllamaWslSetupGuide } from '../shared/ollama-wsl-setup-guide'
import { runOnboard, readCurrentConfig, switchProvider } from './services/onboarder'
import {
  startGateway,
  stopGateway,
  restartGateway,
  getGatewayStatus,
  ensureGatewayReady,
  setGatewayLogCallback
} from './services/gateway'
import { checkWslState, diagnoseWslInstall } from './services/wsl-utils'
import { checkForUpdates, downloadUpdate, installUpdate } from './services/updater'
import { uninstallOpenClaw } from './services/uninstaller'
import { exportBackup, importBackup } from './services/backup'
import { loginOpenAICodex } from './services/oauth'
import { readAppSettings, writeAppSettings } from './services/app-settings'
import {
  SETTINGS_OLLAMA_MODELS_WIN_PATH,
  winPathToOllamaModelsWslPath
} from './services/ollama-models-path'
import { openDashboardInSystemBrowser } from './services/openclaw-dashboard'
import { zaloPairingApprove, zaloPairingList } from './services/zalo-pairing'
import { applyBundledEmailCredentials, listBundledSkills } from './services/bundled-skills'
import {
  ensureBundledEmailSkillAutomation,
  getBundledEmailSetupStatus,
  sendBundledEmailTestWsl
} from './services/email-skill-setup'

interface WizardPersistedState {
  step: string
  wslInstalled: boolean
  timestamp: number
}

const getWizardStatePath = (): string => join(app.getPath('userData'), 'wizard-state.json')

const readSettings = readAppSettings
const writeSettings = writeAppSettings

export const getSavedLocale = (): string => {
  const settings = readSettings()
  if (typeof settings.language === 'string') return settings.language
  const sys = app.getLocale()
  if (sys.startsWith('ko')) return 'ko'
  if (sys.startsWith('ja')) return 'ja'
  if (sys.startsWith('zh')) return 'zh'
  if (sys.startsWith('fr')) return 'fr'
  if (sys.startsWith('vi')) return 'vi'
  return 'en'
}

export const registerIpcHandlers = (getWin: () => BrowserWindow | null): void => {
  const win = (): BrowserWindow => {
    const w = getWin()
    if (!w || w.isDestroyed()) throw new Error('No active window')
    return w
  }

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('skills:list-bundled', () => listBundledSkills())

  ipcMain.handle('email-bundled:ensure-automation', async () => {
    try {
      await ensureBundledEmailSkillAutomation(() => {})
      return { success: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false as const, error: msg }
    }
  })
  ipcMain.handle('email-bundled:status', () => getBundledEmailSetupStatus())
  ipcMain.handle('email-bundled:send-test', (_e, to: string) => sendBundledEmailTestWsl(to))
  ipcMain.handle(
    'email-bundled:apply-credentials',
    async (_e, credentials: Record<string, string>) => applyBundledEmailCredentials(credentials, () => {})
  )

  ipcMain.handle('env:check', () => checkEnvironment())
  ipcMain.handle('env:check-ollama-wizard-disk', (_e, modelId?: string) =>
    checkOllamaWizardDiskSpace(modelId)
  )
  ipcMain.handle('openclaw:check-update', () => checkOpenclawUpdate())

  // WSL-related IPC
  ipcMain.handle('wsl:check', () => checkWslState())
  ipcMain.handle('wsl:system-drive-disk-hint', () => getWslWindowsSystemDriveDiskHint())
  ipcMain.handle('wsl:diagnose', () => diagnoseWslInstall())
  ipcMain.handle('wsl:open-features', async () => {
    if (platform() !== 'win32') return { success: false as const, error: 'windows_only' }
    try {
      await shell.openExternal('ms-settings:optionalfeatures')
      return { success: true as const }
    } catch {
      return { success: false as const, error: 'open_failed' }
    }
  })
  ipcMain.handle('wsl:open-store-ubuntu', async () => {
    if (platform() !== 'win32') return { success: false as const, error: 'windows_only' }
    try {
      await shell.openExternal('ms-windows-store://pdp/?ProductId=9PDXGNCFSCZV')
      return { success: true as const }
    } catch {
      return { success: false as const, error: 'open_failed' }
    }
  })
  ipcMain.handle('wsl:open-windows-update', async () => {
    if (platform() !== 'win32') return { success: false as const, error: 'windows_only' }
    try {
      await shell.openExternal('ms-settings:windowsupdate')
      return { success: true as const }
    } catch {
      return { success: false as const, error: 'open_failed' }
    }
  })

  ipcMain.handle('wsl:install', async (_e, prevState?: string) => {
    try {
      const result = await installWsl(win(), prevState as Parameters<typeof installWsl>[1])
      return { success: true, needsReboot: result.needsReboot, state: result.state }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        win().webContents.send('install:error', msg)
      } catch {
        /* window destroyed */
      }
      return { success: false, error: msg }
    }
  })

  // Wizard state persistence IPC
  ipcMain.handle('wizard:save-state', (_e, state: WizardPersistedState) => {
    try {
      writeFileSync(getWizardStatePath(), JSON.stringify(state))
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('wizard:load-state', () => {
    try {
      const path = getWizardStatePath()
      if (!existsSync(path)) return null
      const state: WizardPersistedState = JSON.parse(readFileSync(path, 'utf-8'))
      // Expire after 24 hours
      if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
        unlinkSync(path)
        return null
      }
      return state
    } catch {
      return null
    }
  })

  ipcMain.handle('wizard:clear-state', () => {
    try {
      const path = getWizardStatePath()
      if (existsSync(path)) unlinkSync(path)
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('install:node', async () => {
    try {
      if (platform() === 'win32') {
        await installNodeWsl(win())
      } else {
        await installNodeMac(win())
      }
      return { success: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        win().webContents.send('install:error', msg)
      } catch {
        /* window destroyed */
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('install:python', async () => {
    try {
      if (platform() === 'win32') {
        await installPythonWsl(win())
      } else {
        return {
          success: false as const,
          error: i18nMain.t('installer.pythonNativeManual')
        }
      }
      return { success: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        win().webContents.send('install:error', msg)
      } catch {
        /* window destroyed */
      }
      return { success: false as const, error: msg }
    }
  })

  ipcMain.handle('install:openclaw', async () => {
    try {
      if (platform() === 'win32') {
        await installOpenClawWsl(win())
      } else {
        await installOpenClaw(win())
      }
      return { success: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        win().webContents.send('install:error', msg)
      } catch {
        /* window destroyed */
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('install:ollama', async () => {
    try {
      if (platform() === 'win32') {
        return {
          success: false as const,
          error: i18nMain.t('installer.ollamaManualOnlyWindows')
        }
      }
      if (platform() === 'darwin') {
        await installOllamaMac(win())
      } else {
        await installOllamaLinux(win())
      }
      return { success: true as const, ollamaApiListening: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        win().webContents.send('install:error', msg)
      } catch {
        /* window destroyed */
      }
      return { success: false as const, error: msg }
    }
  })

  ipcMain.handle('ollama:probe-wsl-localhost', async (_evt, opts?: { tryBringUp?: boolean }) => {
    if (platform() !== 'win32') return { listening: false as const, diagnostics: [] as string[] }
    const tryBringUp = opts?.tryBringUp === true
    const diagnostics: string[] = []
    const note = (s: string): void => {
      diagnostics.push(s)
    }
    if (tryBringUp) {
      note('— App: trying to start Ollama in WSL (systemctl / ollama serve), same as after install')
      const up = await ensureOllamaApiListeningWsl((m) => note(m))
      if (up) {
        note('— Result: Ollama answered on 11434 after bring-up')
        const { collectOllamaWslConnectivityDiagnostics: collectOk } = await import(
          './services/ollama-wsl-endpoint'
        )
        diagnostics.push('— WSL facts:')
        diagnostics.push(...(await collectOk()))
        return { listening: true as const, diagnostics }
      }
      note('— Bring-up finished: still no API; continuing checks below')
    }
    const {
      probeOllamaInWsl,
      probeOllamaFromWindowsNode,
      collectOllamaWslConnectivityDiagnostics
    } = await import('./services/ollama-wsl-endpoint')
    const capMs = tryBringUp ? 30_000 : 22_000
    const run = async (): Promise<boolean> => {
      try {
        if (await probeOllamaInWsl('http://127.0.0.1:11434')) return true
      } catch {
        /* treat as down */
      }
      try {
        return await probeOllamaFromWindowsNode(10_000)
      } catch {
        return false
      }
    }
    try {
      const listening = await Promise.race([
        run(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), capMs))
      ])
      note(
        listening
          ? '— Combined probe: OK (WSL or Windows loopback reached 11434)'
          : '— Combined probe: no response before timeout (see WSL facts below)'
      )
      diagnostics.push('— WSL facts (Ubuntu as root, same as OpenClaw):')
      diagnostics.push(...(await collectOllamaWslConnectivityDiagnostics()))
      return { listening, diagnostics }
    } catch (e) {
      note(`— Probe error: ${e instanceof Error ? e.message : String(e)}`)
      try {
        diagnostics.push(...(await collectOllamaWslConnectivityDiagnostics()))
      } catch {
        /* empty */
      }
      return { listening: false as const, diagnostics }
    }
  })

  ipcMain.handle('settings:get-ollama-models-win-path', () => {
    const v = readSettings()[SETTINGS_OLLAMA_MODELS_WIN_PATH]
    return typeof v === 'string' ? v : ''
  })

  ipcMain.handle('settings:set-ollama-models-win-path', (_e, winPath: unknown) => {
    if (winPath === null || winPath === undefined) {
      writeSettings({ [SETTINGS_OLLAMA_MODELS_WIN_PATH]: '' })
      return { ok: true as const }
    }
    if (typeof winPath !== 'string') return { ok: false as const, error: 'Invalid path' }
    const trimmed = winPath.trim()
    if (!trimmed) {
      writeSettings({ [SETTINGS_OLLAMA_MODELS_WIN_PATH]: '' })
      return { ok: true as const }
    }
    if (platform() !== 'win32') return { ok: false as const, error: 'Windows only' }
    const wsl = winPathToOllamaModelsWslPath(trimmed)
    if (!wsl) {
      return {
        ok: false as const,
        error: 'Use a path like D:\\OpenClaw\\Ollama (drive letter + folder)'
      }
    }
    try {
      mkdirSync(trimmed, { recursive: true })
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
    writeSettings({ [SETTINGS_OLLAMA_MODELS_WIN_PATH]: trimmed })
    return { ok: true as const, wslModelsPath: wsl }
  })

  ipcMain.handle('dialog:pick-ollama-models-folder', async () => {
    const r = await dialog.showOpenDialog(win(), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'OpenClaw — Ollama models folder'
    })
    if (r.canceled || !r.filePaths[0]) return { canceled: true as const }
    return { canceled: false as const, path: r.filePaths[0] }
  })

  ipcMain.handle('install:apply-ollama-wsl-env', async () => {
    try {
      await applyOllamaModelsEnvWsl()
      return { success: true as const }
    } catch (e) {
      return { success: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(
    'onboard:run',
    async (
      _e,
      config: {
        provider: 'anthropic' | 'google' | 'openai' | 'minimax' | 'glm' | 'deepseek' | 'ollama'
        apiKey?: string
        authMethod?: 'api-key' | 'oauth'
        telegramBotToken?: string
        zaloBotToken?: string
        zaloOaId?: string
        zaloOaSecret?: string
        larkAppId?: string
        larkAppSecret?: string
        modelId?: string
        enableNemoShield?: boolean
        selectedSkills?: string[]
        bundledSkillSelections?: { id: string; credentials: Record<string, string> }[]
      }
    ) => {
      try {
        const result = await runOnboard(win(), config)
        return {
          success: true,
          botUsername: result.botUsername,
          ollamaWslSetupGuide: result.ollamaWslSetupGuide,
          ollamaSetupLog: result.ollamaSetupLog
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const ollamaWslSetupGuide =
          e instanceof Error
            ? (e as Error & { ollamaWslSetupGuide?: OllamaWslSetupGuide }).ollamaWslSetupGuide
            : undefined
        const ollamaSetupLog =
          e instanceof Error
            ? (e as Error & { ollamaSetupLog?: string[] }).ollamaSetupLog
            : undefined
        try {
          win().webContents.send('install:error', msg)
        } catch {
          /* window destroyed */
        }
        return { success: false, error: msg, ollamaWslSetupGuide, ollamaSetupLog }
      }
    }
  )

  ipcMain.handle('oauth:openai-codex', async () => {
    try {
      await loginOpenAICodex(win())
      return { success: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  // Read config / switch provider
  ipcMain.handle('config:read', async () => {
    try {
      const config = await readCurrentConfig()
      return { success: true, config }
    } catch (e) {
      return { success: false, config: null, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('dashboard:open', () => openDashboardInSystemBrowser())

  ipcMain.handle(
    'config:switch-provider',
    async (
      _e,
      config: {
        provider: 'anthropic' | 'google' | 'openai' | 'minimax' | 'glm' | 'deepseek' | 'ollama'
        apiKey?: string
        authMethod?: 'api-key' | 'oauth'
        modelId?: string
      }
    ) => {
      try {
        await switchProvider(win(), config)
        await restartGateway()
        return { success: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        try {
          win().webContents.send('install:error', msg)
        } catch {
          /* window destroyed */
        }
        return { success: false, error: msg }
      }
    }
  )

  // Forward Gateway logs to renderer
  setGatewayLogCallback((msg) => {
    try {
      win().webContents.send('gateway:log', msg)
    } catch {
      /* window destroyed */
    }
  })

  ipcMain.handle('gateway:start', async () => {
    try {
      const result = await startGateway()
      const success = result.status === 'started'
      return { success, error: result.error }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('gateway:stop', async () => {
    try {
      await stopGateway()
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('gateway:restart', async () => {
    try {
      const result = await restartGateway()
      const success = result.status === 'started'
      return { success, error: result.error }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('gateway:status', () => getGatewayStatus())

  ipcMain.handle('gateway:ensure-ready', async () => {
    try {
      return await ensureGatewayReady()
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('pairing:zalo-list', async () => zaloPairingList())
  ipcMain.handle('pairing:zalo-approve', async (_e, code: string) => zaloPairingApprove(code))

  ipcMain.handle('troubleshoot:check-port', () => checkPort())
  ipcMain.handle('troubleshoot:fixer-fix', () => runFixerFix(win()))

  ipcMain.handle('smoke:run', async () => {
    try {
      const { runSmokeTests } = await import('./services/smoke-tests')
      return await runSmokeTests()
    } catch {
      return []
    }
  })

  ipcMain.handle('newsletter:subscribe', async (_e, email: string) => {
    try {
      const r = await fetch('https://enchante.cloud/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'app' })
      })
      if (!r.ok) return { success: false }
      const data = await r.json()
      return { success: data.success !== false }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('security:status', async () => {
    try {
      const { readSecurityStatus } = await import('./services/onboarder')
      return await readSecurityStatus()
    } catch {
      return { nemoShieldEnabled: false }
    }
  })

  ipcMain.handle('security:set-nemo-shield', (_e, enabled: boolean) => {
    try {
      writeAppSettings({ nemoShieldEnabled: enabled === true })
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.on('system:reboot', () => {
    if (platform() !== 'win32') return
    const child = spawn('shutdown', ['/r', '/t', '0'], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
  })

  // Auto update IPC
  ipcMain.handle('update:check', () => {
    checkForUpdates()
    return { success: true }
  })

  ipcMain.handle('update:download', () => {
    downloadUpdate()
    return { success: true }
  })

  ipcMain.handle('update:install', () => {
    installUpdate()
    return { success: true }
  })

  // Auto launch IPC
  ipcMain.handle('autolaunch:get', () => ({
    enabled: app.getLoginItemSettings().openAtLogin
  }))

  ipcMain.handle('autolaunch:set', (_e, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      args: ['--hidden']
    })
    writeSettings({ autoLaunchInitialized: true, autoLaunchEnabled: enabled })
    return { success: true }
  })

  // Uninstall OpenClaw
  ipcMain.handle('uninstall:openclaw', async (_e, opts: { removeConfig: boolean }) => {
    try {
      await uninstallOpenClaw(win(), opts)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Backup / restore
  ipcMain.handle('backup:export', () => exportBackup(win()))
  ipcMain.handle('backup:import', () => importBackup(win()))

  // i18n settings
  ipcMain.handle('i18n:get-locale', () => i18nMain.language || getSavedLocale())

  /** Same order as LanguageSwitcher: vi → en → zh → fr → ja → ko */
  const SUPPORTED_LANGS = ['vi', 'en', 'zh', 'fr', 'ja', 'ko']

  ipcMain.handle('i18n:set-language', async (_e, lng: string) => {
    if (!SUPPORTED_LANGS.includes(lng)) {
      return { success: false, error: 'Unsupported language' }
    }
    writeSettings({ language: lng })
    await initI18nMain(lng)
    rebuildTrayMenu()
    return { success: true }
  })
}
