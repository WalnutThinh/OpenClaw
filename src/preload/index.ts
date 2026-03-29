import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  env: {
    check: (): Promise<{
      os: 'macos' | 'windows' | 'linux'
      nodeInstalled: boolean
      nodeVersion: string | null
      nodeVersionOk: boolean
      openclawInstalled: boolean
      openclawVersion: string | null
      openclawLatestVersion: string | null
      ollamaInstalled: boolean
      ollamaVersion: string | null
      pythonInstalled: boolean
      pythonVersion: string | null
      pythonVersionOk: boolean
      wslState?:
        | 'not_available'
        | 'not_installed'
        | 'needs_reboot'
        | 'no_distro'
        | 'not_initialized'
        | 'ready'
      ollamaPreflight: {
        totalRamBytes: number
        freeDiskBytes: number | null
        freeDiskCheckPath: string
        wslReadyForOllama: boolean
        ramMeetsRecommendation: boolean
        diskMeetsRecommendation: boolean | null
        ollamaModelsWinPath: string | null
        ollamaModelsWslPath: string
      }
    }> => ipcRenderer.invoke('env:check'),
    checkOllamaWizardDisk: (
      modelId?: string
    ): Promise<{
      ok: boolean
      freeBytes: number | null
      requiredBytes: number
      checkPath: string
    }> => ipcRenderer.invoke('env:check-ollama-wizard-disk', modelId)
  },
  settings: {
    getOllamaModelsWinPath: (): Promise<string> =>
      ipcRenderer.invoke('settings:get-ollama-models-win-path'),
    setOllamaModelsWinPath: (
      path: string
    ): Promise<{ ok: boolean; error?: string; wslModelsPath?: string }> =>
      ipcRenderer.invoke('settings:set-ollama-models-win-path', path)
  },
  dialog: {
    pickOllamaModelsFolder: (): Promise<
      { canceled: true } | { canceled: false; path: string }
    > => ipcRenderer.invoke('dialog:pick-ollama-models-folder')
  },
  install: {
    node: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('install:node'),
    python: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('install:python'),
    openclaw: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('install:openclaw'),
    ollama: (): Promise<
      | { success: true; ollamaApiListening?: boolean }
      | { success: false; error?: string }
    > => ipcRenderer.invoke('install:ollama'),
    applyOllamaWslEnv: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('install:apply-ollama-wsl-env'),
    onProgress: (cb: (msg: string) => void): (() => void) => {
      const handler = (_: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('install:progress', handler)
      return () => ipcRenderer.removeListener('install:progress', handler)
    },
    onError: (cb: (msg: string) => void): (() => void) => {
      const handler = (_: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('install:error', handler)
      return () => ipcRenderer.removeListener('install:error', handler)
    },
    /** Same IPC as `ollama.probeWslLocalhost`; lives under `install` so it ships with the same bridge as `install.ollama`. */
    probeOllamaApi: (opts?: { tryBringUp?: boolean }): Promise<{ listening: boolean; diagnostics: string[] }> =>
      ipcRenderer.invoke('ollama:probe-wsl-localhost', opts ?? {})
  },
  ollama: {
    probeWslLocalhost: (opts?: { tryBringUp?: boolean }): Promise<{ listening: boolean; diagnostics: string[] }> =>
      ipcRenderer.invoke('ollama:probe-wsl-localhost', opts ?? {})
  },
  onboard: {
    run: (config: {
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
    }): Promise<{
      success: boolean
      error?: string
      botUsername?: string
      ollamaWslSetupGuide?: {
        variant: 'nothing_on_11434' | 'bind_for_wsl' | 'try_windows_host'
        winStandardInstallFound: boolean
        attemptedBaseUrl?: string
      }
      ollamaSetupLog?: string[]
    }> => ipcRenderer.invoke('onboard:run', config)
  },
  oauth: {
    loginCodex: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('oauth:openai-codex')
  },
  skills: {
    listBundled: (): Promise<
      Array<{
        id: string
        category: string
        name: string
        summary: string
        credentialFields: { id: string; labelKey: string; type: 'text' | 'password' }[]
      }>
    > => ipcRenderer.invoke('skills:list-bundled')
  },
  emailBundled: {
    ensureAutomation: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('email-bundled:ensure-automation'),
    status: (): Promise<{ skillInstalled: boolean; envExists: boolean }> =>
      ipcRenderer.invoke('email-bundled:status'),
    sendTest: (to: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('email-bundled:send-test', to),
    applyCredentials: (credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('email-bundled:apply-credentials', credentials)
  },
  reboot: (): void => ipcRenderer.send('system:reboot'),
  pairing: {
    zaloList: (): Promise<{ ok: boolean; output: string }> =>
      ipcRenderer.invoke('pairing:zalo-list'),
    zaloApprove: (code: string): Promise<{ ok: boolean; output: string }> =>
      ipcRenderer.invoke('pairing:zalo-approve', code)
  },
  gateway: {
    start: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('gateway:start'),
    stop: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('gateway:stop'),
    restart: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('gateway:restart'),
    status: (): Promise<'running' | 'stopped'> => ipcRenderer.invoke('gateway:status'),
    ensureReady: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('gateway:ensure-ready'),
    onLog: (cb: (msg: string) => void): (() => void) => {
      const handler = (_: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('gateway:log', handler)
      return () => ipcRenderer.removeListener('gateway:log', handler)
    },
    onStatusChanged: (cb: (status: 'running' | 'stopped') => void): (() => void) => {
      const handler = (_: unknown, s: 'running' | 'stopped'): void => cb(s)
      ipcRenderer.on('gateway:status-changed', handler)
      return () => ipcRenderer.removeListener('gateway:status-changed', handler)
    }
  },
  troubleshoot: {
    checkPort: (): Promise<{ inUse: boolean; pid?: string }> =>
      ipcRenderer.invoke('troubleshoot:check-port'),
    fixerFix: (): Promise<{ success: boolean }> => ipcRenderer.invoke('troubleshoot:fixer-fix')
  },
  smoke: {
    run: (): Promise<Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail?: string }>> =>
      ipcRenderer.invoke('smoke:run')
  },
  wsl: {
    check: (): Promise<
      'not_available' | 'not_installed' | 'needs_reboot' | 'no_distro' | 'not_initialized' | 'ready'
    > => ipcRenderer.invoke('wsl:check'),
    systemDriveDiskHint: (): Promise<{
      supported: boolean
      checkPath: string
      driveLabel: string
      freeBytes: number | null
      recommendedMinBytes: number
      meetsRecommendation: boolean | null
    }> => ipcRenderer.invoke('wsl:system-drive-disk-hint'),
    diagnose: (): Promise<{
      state: 'not_available' | 'not_installed' | 'needs_reboot' | 'no_distro' | 'not_initialized' | 'ready'
      lines: string[]
    }> => ipcRenderer.invoke('wsl:diagnose'),
    install: (
      prevState?: string
    ): Promise<{ success: boolean; needsReboot?: boolean; state?: string; error?: string }> =>
      ipcRenderer.invoke('wsl:install', prevState),
    openFeatures: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wsl:open-features'),
    openStoreUbuntu: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wsl:open-store-ubuntu'),
    openWindowsUpdate: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wsl:open-windows-update')
  },
  wizard: {
    saveState: (state: {
      step: string
      wslInstalled: boolean
      timestamp: number
    }): Promise<{ success: boolean }> => ipcRenderer.invoke('wizard:save-state', state),
    loadState: (): Promise<{
      step: string
      wslInstalled: boolean
      timestamp: number
    } | null> => ipcRenderer.invoke('wizard:load-state'),
    clearState: (): Promise<{ success: boolean }> => ipcRenderer.invoke('wizard:clear-state')
  },
  newsletter: {
    subscribe: (email: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('newsletter:subscribe', email)
  },
  update: {
    check: (): Promise<{ success: boolean }> => ipcRenderer.invoke('update:check'),
    download: (): Promise<{ success: boolean }> => ipcRenderer.invoke('update:download'),
    install: (): Promise<{ success: boolean }> => ipcRenderer.invoke('update:install'),
    onAvailable: (cb: (info: { version: string }) => void): (() => void) => {
      const handler = (_: unknown, info: { version: string }): void => cb(info)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onProgress: (cb: (percent: number) => void): (() => void) => {
      const handler = (_: unknown, p: number): void => cb(p)
      ipcRenderer.on('update:progress', handler)
      return () => ipcRenderer.removeListener('update:progress', handler)
    },
    onDownloaded: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onError: (cb: (msg: string) => void): (() => void) => {
      const handler = (_: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    }
  },
  dashboard: {
    open: (): Promise<
      | { ok: true; hadToken: boolean }
      | { ok: false; reason: 'gateway_stopped' }
    > => ipcRenderer.invoke('dashboard:open')
  },
  config: {
    read: (): Promise<{
      success: boolean
      config: {
        provider?: string
        model?: string
        hasTelegram?: boolean
        hasZalo?: boolean
        hasLark?: boolean
      } | null
      error?: string
    }> => ipcRenderer.invoke('config:read'),
    switchProvider: (config: {
      provider: 'anthropic' | 'google' | 'openai' | 'minimax' | 'glm' | 'deepseek' | 'ollama'
      apiKey?: string
      authMethod?: 'api-key' | 'oauth'
      telegramBotToken?: string
      zaloOaId?: string
      zaloOaSecret?: string
      larkAppId?: string
      larkAppSecret?: string
      modelId?: string
      enableNemoShield?: boolean
      selectedSkills?: string[]
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('config:switch-provider', config)
  },
  openclaw: {
    checkUpdate: (): Promise<{ currentVersion: string | null; latestVersion: string | null }> =>
      ipcRenderer.invoke('openclaw:check-update')
  },
  autoLaunch: {
    get: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('autolaunch:get'),
    set: (enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('autolaunch:set', enabled)
  },
  uninstall: {
    openclaw: (opts: { removeConfig: boolean }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('uninstall:openclaw', opts),
    onProgress: (cb: (msg: string) => void): (() => void) => {
      const handler = (_: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('uninstall:progress', handler)
      return () => ipcRenderer.removeListener('uninstall:progress', handler)
    }
  },
  backup: {
    export: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:export'),
    import: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('backup:import')
  },
  security: {
    status: (): Promise<{ nemoShieldEnabled: boolean }> =>
      ipcRenderer.invoke('security:status'),
    setNemoShield: (enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('security:set-nemo-shield', enabled)
  },
  i18n: {
    getLocale: (): Promise<string> => ipcRenderer.invoke('i18n:get-locale'),
    setLanguage: (lng: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('i18n:set-language', lng)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
