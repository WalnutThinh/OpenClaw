type WslState =
  | 'not_available'
  | 'not_installed'
  | 'needs_reboot'
  | 'no_distro'
  | 'not_initialized'
  | 'ready'

type OllamaWslSetupGuide = {
  variant: 'nothing_on_11434' | 'bind_for_wsl' | 'try_windows_host'
  winStandardInstallFound: boolean
  attemptedBaseUrl?: string
}

interface WizardPersistedState {
  step: string
  wslInstalled: boolean
  timestamp: number
}

interface ElectronAPI {
  version: () => Promise<string>
  env: {
    check: () => Promise<{
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
      wslState?: WslState
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
    }>
    checkOllamaWizardDisk: (modelId?: string) => Promise<{
      ok: boolean
      freeBytes: number | null
      requiredBytes: number
      checkPath: string
    }>
  }
  settings: {
    getOllamaModelsWinPath: () => Promise<string>
    setOllamaModelsWinPath: (
      path: string
    ) => Promise<{ ok: boolean; error?: string; wslModelsPath?: string }>
  }
  dialog: {
    pickOllamaModelsFolder: () => Promise<{ canceled: true } | { canceled: false; path: string }>
  }
  install: {
    node: () => Promise<{ success: boolean; error?: string }>
    python: () => Promise<{ success: boolean; error?: string }>
    openclaw: () => Promise<{ success: boolean; error?: string }>
    ollama: () => Promise<
      | { success: true; ollamaApiListening?: boolean }
      | { success: false; error?: string }
    >
    applyOllamaWslEnv: () => Promise<{ success: boolean; error?: string }>
    probeOllamaApi: (opts?: { tryBringUp?: boolean }) => Promise<{ listening: boolean; diagnostics: string[] }>
    onProgress: (cb: (msg: string) => void) => () => void
    onError: (cb: (msg: string) => void) => () => void
  }
  ollama: {
    probeWslLocalhost: (opts?: { tryBringUp?: boolean }) => Promise<{ listening: boolean }>
  }
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
    }) => Promise<{
      success: boolean
      error?: string
      botUsername?: string
      ollamaWslSetupGuide?: OllamaWslSetupGuide
      ollamaSetupLog?: string[]
    }>
  }
  oauth: {
    loginCodex: () => Promise<{ success: boolean; error?: string }>
  }
  skills: {
    listBundled: () => Promise<
      Array<{
        id: string
        category: string
        name: string
        summary: string
        credentialFields: { id: string; labelKey: string; type: 'text' | 'password' }[]
      }>
    >
  }
  emailBundled: {
    ensureAutomation: () => Promise<{ success: boolean; error?: string }>
    status: () => Promise<{ skillInstalled: boolean; envExists: boolean }>
    sendTest: (to: string) => Promise<{ ok: boolean; error?: string }>
    applyCredentials: (credentials: Record<string, string>) => Promise<{ ok: boolean; error?: string }>
  }
  reboot: () => void
  pairing: {
    zaloList: () => Promise<{ ok: boolean; output: string }>
    zaloApprove: (code: string) => Promise<{ ok: boolean; output: string }>
  },
  gateway: {
    start: () => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<{ success: boolean; error?: string }>
    restart: () => Promise<{ success: boolean; error?: string }>
    status: () => Promise<'running' | 'stopped'>
    ensureReady: () => Promise<{ ok: boolean; error?: string }>
    onLog: (cb: (msg: string) => void) => () => void
    onStatusChanged: (cb: (status: 'running' | 'stopped') => void) => () => void
  }
  troubleshoot: {
    checkPort: () => Promise<{ inUse: boolean; pid?: string }>
    fixerFix: () => Promise<{ success: boolean }>
  }
  smoke: {
    run: () => Promise<Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail?: string }>>
  }
  wsl: {
    check: () => Promise<WslState>
    systemDriveDiskHint: () => Promise<{
      supported: boolean
      checkPath: string
      driveLabel: string
      freeBytes: number | null
      recommendedMinBytes: number
      meetsRecommendation: boolean | null
    }>
    diagnose: () => Promise<{ state: WslState; lines: string[] }>
    install: (
      prevState?: WslState
    ) => Promise<{ success: boolean; needsReboot?: boolean; state?: WslState; error?: string }>
    openFeatures: () => Promise<{ success: boolean; error?: string }>
    openStoreUbuntu: () => Promise<{ success: boolean; error?: string }>
    openWindowsUpdate: () => Promise<{ success: boolean; error?: string }>
  }
  wizard: {
    saveState: (state: WizardPersistedState) => Promise<{ success: boolean }>
    loadState: () => Promise<WizardPersistedState | null>
    clearState: () => Promise<{ success: boolean }>
  }
  newsletter: {
    subscribe: (email: string) => Promise<{ success: boolean }>
  }
  update: {
    check: () => Promise<{ success: boolean }>
    download: () => Promise<{ success: boolean }>
    install: () => Promise<{ success: boolean }>
    onAvailable: (cb: (info: { version: string }) => void) => () => void
    onProgress: (cb: (percent: number) => void) => () => void
    onDownloaded: (cb: () => void) => () => void
    onError: (cb: (msg: string) => void) => () => void
  }
  dashboard: {
    open: () => Promise<
      { ok: true; hadToken: boolean } | { ok: false; reason: 'gateway_stopped' }
    >
  }
  config: {
    read: () => Promise<{
      success: boolean
      config: {
        provider?: string
        model?: string
        hasTelegram?: boolean
        hasZalo?: boolean
        hasLark?: boolean
      } | null
      error?: string
    }>
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
    }) => Promise<{ success: boolean; error?: string }>
  }
  openclaw: {
    checkUpdate: () => Promise<{ currentVersion: string | null; latestVersion: string | null }>
  }
  autoLaunch: {
    get: () => Promise<{ enabled: boolean }>
    set: (enabled: boolean) => Promise<{ success: boolean }>
  }
  uninstall: {
    openclaw: (opts: { removeConfig: boolean }) => Promise<{ success: boolean; error?: string }>
    onProgress: (cb: (msg: string) => void) => () => void
  }
  backup: {
    export: () => Promise<{ success: boolean; error?: string }>
    import: () => Promise<{ success: boolean; error?: string }>
  }
  security: {
    status: () => Promise<{ nemoShieldEnabled: boolean }>
    setNemoShield: (enabled: boolean) => Promise<{ success: boolean }>
  }
  i18n: {
    getLocale: () => Promise<string>
    setLanguage: (lng: string) => Promise<{ success: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
