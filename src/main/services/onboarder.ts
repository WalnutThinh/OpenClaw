import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { platform, homedir } from 'os'
import { join } from 'path'
import https from 'https'
import { BrowserWindow } from 'electron'
import {
  runInWsl,
  readWslFile,
  writeWslFile,
  buildWslPathOnlyPrefix
} from './wsl-utils'
import { applyOllamaModelsEnvWsl } from './installer'
import { t } from '../../shared/i18n/main'
import { writeAppSettings } from './app-settings'
import { installBundledSkillSelections } from './bundled-skills'
import type { OllamaWslSetupGuide } from '../../shared/ollama-wsl-setup-guide'
import {
  ollamaModelTagForOnboard,
  resolveOllamaBaseUrlForWsl,
  windowsOllamaStandardInstallFound,
  type OllamaWslEndpointResolution
} from './ollama-wsl-endpoint'

interface OnboardConfig {
  provider: 'anthropic' | 'google' | 'openai' | 'minimax' | 'glm' | 'deepseek' | 'ollama'
  apiKey?: string
  authMethod?: 'api-key' | 'oauth'
  telegramBotToken?: string
  /** Zalo Bot Platform — Bot Token (see https://bot.zapps.me/docs/create-bot/) */
  zaloBotToken?: string
  zaloOaId?: string
  zaloOaSecret?: string
  larkAppId?: string
  larkAppSecret?: string
  modelId?: string
  enableNemoShield?: boolean
  selectedSkills?: string[]
  /** Local / packaged skill folders copied into workspace + optional env files */
  bundledSkillSelections?: { id: string; credentials: Record<string, string> }[]
}

interface OnboardResult {
  botUsername?: string
  configuredChannels?: string[]
  ollamaWslSetupGuide?: OllamaWslSetupGuide
  /** Windows + Ollama: every progress line (for in-app diagnosis; no terminal). */
  ollamaSetupLog?: string[]
}

function buildOllamaWslSetupGuide(res: OllamaWslEndpointResolution): OllamaWslSetupGuide | undefined {
  if (res.reachable) return undefined
  const winStandardInstallFound = windowsOllamaStandardInstallFound()
  if (res.likelyOllamaWindowsLocalhostOnly) {
    return { variant: 'bind_for_wsl', winStandardInstallFound, attemptedBaseUrl: res.baseUrl }
  }
  if (res.noOllamaResponded) {
    return { variant: 'nothing_on_11434', winStandardInstallFound, attemptedBaseUrl: res.baseUrl }
  }
  if (res.via === 'windows-host-guess') {
    return { variant: 'try_windows_host', winStandardInstallFound, attemptedBaseUrl: res.baseUrl }
  }
  return { variant: 'nothing_on_11434', winStandardInstallFound, attemptedBaseUrl: res.baseUrl }
}

function withOllamaWslSetupGuide(
  e: unknown,
  guide: OllamaWslSetupGuide | undefined,
  ollamaSetupLog?: string[]
): Error {
  const err = e instanceof Error ? e : new Error(String(e))
  if (guide) (err as Error & { ollamaWslSetupGuide?: OllamaWslSetupGuide }).ollamaWslSetupGuide = guide
  if (ollamaSetupLog?.length)
    (err as Error & { ollamaSetupLog?: string[] }).ollamaSetupLog = [...ollamaSetupLog]
  return err
}

const telegramGet = (url: string): Promise<{ ok: boolean; [k: string]: unknown }> =>
  new Promise((resolve) => {
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve({ ok: false })
          }
        })
      })
      .on('error', () => resolve({ ok: false }))
  })

const fetchBotUsername = async (token: string): Promise<string | undefined> => {
  const json = await telegramGet(`https://api.telegram.org/bot${token}/getMe`)
  return json.ok ? (json as unknown as { result: { username: string } }).result.username : undefined
}

const waitTelegramClear = async (token: string): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    const res = await telegramGet(
      `https://api.telegram.org/bot${token}/getUpdates?timeout=0&limit=1`
    )
    if (res.ok) return
    await new Promise((r) => setTimeout(r, 3000))
  }
}

import { getPathEnv, findBin } from './path-utils'

const OAUTH_PROFILE_ID = 'openai-codex:default'

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'anthropic/claude-sonnet-4-6',
  google: 'google/gemini-3-flash',
  openai: 'openai/gpt-5.4',
  'openai-codex': 'openai-codex/gpt-5.4',
  minimax: 'minimax/MiniMax-M2.7',
  glm: 'zai/glm-5',
  deepseek: 'deepseek/deepseek-chat',
  ollama: 'ollama/llama3.2:3b'
}

/**
 * `openclaw onboard --auth-choice ollama` pulls a large default model when `--custom-model-id` is omitted.
 * Always pin a tag; ignore stale cloud ids if the user switched provider without clearing model state.
 */
function ollamaPullTagForOnboard(modelId: string | undefined): string {
  const fallback = ollamaModelTagForOnboard(DEFAULT_MODELS.ollama) ?? 'llama3.2:3b'
  const m = modelId?.trim()
  if (!m) return fallback
  if (/^(zai|google|anthropic|openai|minimax|deepseek)\//i.test(m)) return fallback
  return ollamaModelTagForOnboard(m) ?? fallback
}

function ollamaPrimaryModelIdForConfig(modelId: string | undefined): string {
  return `ollama/${ollamaPullTagForOnboard(modelId)}`
}

const MODEL_SPECS: Partial<
  Record<OnboardConfig['provider'], { contextWindow: number; maxTokens: number }>
> = {
  minimax: { contextWindow: 1000000, maxTokens: 16384 }
}

/** OpenClaw validates `models[].name` (string); `id` alone is not enough for custom providers. */
const DEEPSEEK_PROVIDER_MODELS: Array<{
  id: string
  name: string
  contextWindow: number
  maxTokens: number
}> = [
  { id: 'deepseek-chat', name: 'DeepSeek V3.2', contextWindow: 128000, maxTokens: 8192 },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', contextWindow: 128000, maxTokens: 64000 }
]

const createRunCmd = (): ((
  cmd: string,
  args: string[],
  onLog: (msg: string) => void
) => Promise<void>) => {
  const isWindows = platform() === 'win32'

  return (cmd, args, onLog) =>
    new Promise((resolve, reject) => {
      let fullCmd: string
      let fullArgs: string[]

      if (isWindows) {
        // WSL: Linux-only PATH so npm/openclaw never resolve to /mnt/c/... (plugin security blocks).
        // PATH-only prefix: avoid OLLAMA mkdir/export here — matches global install; prevents empty-path mkdir from some CLI paths.
        const inner = `${cmd} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`
        const script = `${buildWslPathOnlyPrefix()} && ${inner}`
        fullCmd = 'wsl'
        fullArgs = ['-d', 'Ubuntu', '-u', 'root', '--', 'bash', '-lc', script]
      } else {
        fullCmd = cmd
        fullArgs = args
      }

      const child = spawn(fullCmd, fullArgs, {
        env: isWindows ? process.env : getPathEnv()
      })

      const outDecoder = new StringDecoder('utf8')
      const errDecoder = new StringDecoder('utf8')
      child.stdout.on('data', (d) => outDecoder.write(d).split('\n').filter(Boolean).forEach(onLog))
      child.stderr.on('data', (d) => errDecoder.write(d).split('\n').filter(Boolean).forEach(onLog))
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Command failed with exit code ${code}`))
      })
      child.on('error', reject)
    })
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Windows WSL: Ollama on Windows listens on the host — `127.0.0.1` inside Ubuntu is wrong. */
async function buildWindowsWslOllamaOnboardCliExtras(
  modelId: string | undefined,
  log: (msg: string) => void
): Promise<{ extras: string[]; ollamaWslSetupGuide?: OllamaWslSetupGuide }> {
  try {
    await applyOllamaModelsEnvWsl()
  } catch {
    /* ignore */
  }
  const res = await resolveOllamaBaseUrlForWsl({ detailLog: log })
  if (res.reachable) {
    log(t('onboarder.ollamaUsingUrl', { url: res.baseUrl }))
  } else if (res.noOllamaResponded) {
    log(t('onboarder.ollamaNothingListening11434'))
  } else if (res.via === 'windows-host-guess') {
    log(t('onboarder.ollamaUsingWindowsHostGuess', { url: res.baseUrl }))
  } else {
    log(t('onboarder.ollamaUnreachableWsl', { url: res.baseUrl }))
  }
  if (res.likelyOllamaWindowsLocalhostOnly) {
    log(t('onboarder.ollamaWindowsBindLocalhostHint', { url: res.baseUrl }))
  }
  const extras: string[] = ['--custom-base-url', res.baseUrl]
  extras.push('--custom-model-id', ollamaPullTagForOnboard(modelId))
  return { extras, ollamaWslSetupGuide: buildOllamaWslSetupGuide(res) }
}

/** ClawHub may return HTTP rate limits when installing several skills in a row — retry with backoff. */
const installClawhubSkillWithRetries = async (
  skill: string,
  runCmd: ReturnType<typeof createRunCmd>,
  log: (msg: string) => void,
  isWindows: boolean
): Promise<void> => {
  const cmd = isWindows ? 'npm' : 'npx'
  const args = isWindows
    ? ['exec', '--yes', '--', 'clawhub@latest', 'install', '--force', skill]
    : ['--yes', '--', 'clawhub@latest', 'install', '--force', skill]

  const maxAttempts = 6
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runCmd(cmd, args, log)
      return
    } catch (err) {
      lastErr = err
      if (attempt >= maxAttempts) break
      const waitMs = Math.min(20000, 1500 * 2 ** (attempt - 1))
      log(t('onboarder.skillInstallRetry', { skill, seconds: Math.round(waitMs / 1000) }))
      await sleep(waitMs)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

const wslKillOpenclaw = (): Promise<void> =>
  new Promise((resolve) => {
    const child = spawn('wsl', [
      '-d',
      'Ubuntu',
      '-u',
      'root',
      '--',
      'pkill',
      '-9',
      '-f',
      'openclaw'
    ])
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })

export const runOnboard = async (
  win: BrowserWindow,
  config: OnboardConfig
): Promise<OnboardResult> => {
  const isWindows = platform() === 'win32'
  const ollamaSetupLog: string[] = []
  const log = (msg: string): void => {
    if (isWindows && config.provider === 'ollama') ollamaSetupLog.push(msg)
    win.webContents.send('install:progress', msg)
  }

  log(t('onboarder.starting'))
  const isMac = platform() === 'darwin'
  const ocBin = isWindows ? 'openclaw' : findBin('openclaw')
  const fixPath = join(homedir(), '.openclaw', 'ipv4-fix.js')
  const runCmd = createRunCmd()

  // Prevent Telegram API ETIMEDOUT on environments without IPv6 (Node.js 22 autoSelectFamily)
  if (isMac) {
    const macOcDir = join(homedir(), '.openclaw')
    if (!existsSync(macOcDir)) mkdirSync(macOcDir, { recursive: true })
    const fixContent = [
      "const dns = require('dns')",
      'const origLookup = dns.lookup',
      'dns.lookup = function (hostname, options, callback) {',
      "  if (typeof options === 'function') { callback = options; options = { family: 4 } }",
      "  else if (typeof options === 'number') { options = { family: 4 } }",
      '  else { options = Object.assign({}, options, { family: 4 }) }',
      '  return origLookup.call(this, hostname, options, callback)',
      '}'
    ].join('\n')
    writeFileSync(fixPath, fixContent + '\n')

    await new Promise<void>((resolve) => {
      const child = spawn('launchctl', ['setenv', 'NODE_OPTIONS', `--require=${fixPath}`])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
  }

  // Remove existing daemon + kill processes + clean up broken config
  if (isWindows) {
    await wslKillOpenclaw().catch(() => {})
    // Clean up config files inside WSL (preserve auth-profiles.json for OAuth)
    try {
      await runInWsl('rm -f /root/.openclaw/openclaw.json')
    } catch {
      /* ignore */
    }
    const wslAuthClean =
      config.authMethod === 'oauth'
        ? 'rm -f /root/.openclaw/agents/main/agent/auth.json'
        : 'rm -f /root/.openclaw/agents/main/agent/auth.json /root/.openclaw/agents/main/agent/auth-profiles.json'
    try {
      await runInWsl(wslAuthClean)
    } catch {
      /* ignore */
    }
  } else {
    const plist = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist')
    if (existsSync(plist)) {
      await new Promise<void>((resolve) => {
        const child = spawn('launchctl', ['unload', plist])
        child.on('close', () => resolve())
        child.on('error', () => resolve())
      })
      try {
        unlinkSync(plist)
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve) => {
      const child = spawn('pkill', ['-9', '-f', 'openclaw'])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
    const macOcDir = join(homedir(), '.openclaw')
    const configFile = join(macOcDir, 'openclaw.json')
    if (existsSync(configFile))
      try {
        unlinkSync(configFile)
      } catch {
        /* ignore */
      }
    const agentAuthDir = join(macOcDir, 'agents', 'main', 'agent')
    // OAuth: preserve auth-profiles.json since credentials were already saved
    const authFilesToClean =
      config.authMethod === 'oauth' ? ['auth.json'] : ['auth.json', 'auth-profiles.json']
    for (const f of authFilesToClean) {
      const p = join(agentAuthDir, f)
      if (existsSync(p))
        try {
          unlinkSync(p)
        } catch {
          /* ignore */
        }
    }
  }
  // Wait for port release + Telegram long-poll release
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // OAuth: credentials already saved to auth-profiles.json, skip auth in onboard
  const effectiveProvider = config.authMethod === 'oauth' ? 'openai-codex' : config.provider
  const effectiveAuthFlags =
    config.authMethod === 'oauth'
      ? ['--auth-choice', 'skip']
      : config.provider === 'ollama'
        ? ['--auth-choice', 'ollama']
        : config.provider === 'deepseek'
          ? ['--auth-choice', 'skip']
          : {
              anthropic: ['--auth-choice', 'apiKey', '--anthropic-api-key', config.apiKey!],
              google: ['--auth-choice', 'gemini-api-key', '--gemini-api-key', config.apiKey!],
              openai: ['--auth-choice', 'openai-api-key', '--openai-api-key', config.apiKey!],
              minimax: ['--auth-choice', 'minimax-api', '--minimax-api-key', config.apiKey!],
              glm: ['--auth-choice', 'zai-api-key', '--zai-api-key', config.apiKey!]
            }[config.provider]

  let wslOllamaExtras: string[] = []
  let ollamaWslSetupGuide: OllamaWslSetupGuide | undefined
  if (isWindows && config.provider === 'ollama') {
    const ollamaBuilt = await buildWindowsWslOllamaOnboardCliExtras(config.modelId, log)
    wslOllamaExtras = ollamaBuilt.extras
    ollamaWslSetupGuide = ollamaBuilt.ollamaWslSetupGuide
  }

  const openclawArgs = [
    'onboard',
    '--non-interactive',
    '--accept-risk',
    '--mode',
    'local',
    ...effectiveAuthFlags,
    ...wslOllamaExtras,
    ...(config.provider === 'ollama' && !isWindows
      ? (['--custom-model-id', ollamaPullTagForOnboard(config.modelId)] as const)
      : []),
    '--gateway-port',
    '18789',
    '--gateway-bind',
    'loopback',
    // Windows WSL: gateway is started later by the app; skip health check so onboard does not fail on ws:// probe
    ...(isWindows ? ['--skip-health'] : ['--install-daemon', '--daemon-runtime', 'node']),
    '--skip-skills'
  ]

  if (isWindows) {
    try {
      await runInWsl(
        `${buildWslPathOnlyPrefix()} && mkdir -p /root/.openclaw /root/.openclaw/workspace`,
        20000
      )
    } catch {
      /* ignore */
    }
  }

  try {
    await runCmd(
      isWindows ? 'npm' : ocBin,
      isWindows ? ['exec', '--', 'openclaw', ...openclawArgs] : [...openclawArgs],
      log
    )
  } catch (e) {
    // Even if onboard fails with gateway connection test (1006),
    // continue if config file was created
    if (isWindows) {
      try {
        await readWslFile('/root/.openclaw/openclaw.json')
      } catch {
        throw withOllamaWslSetupGuide(
          e,
          config.provider === 'ollama' ? ollamaWslSetupGuide : undefined,
          config.provider === 'ollama' ? ollamaSetupLog : undefined
        )
      }
      log(t('onboarder.configCreatedSkipGw'))
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (!existsSync(configPath))
        throw withOllamaWslSetupGuide(
          e,
          config.provider === 'ollama' ? ollamaWslSetupGuide : undefined,
          config.provider === 'ollama' ? ollamaSetupLog : undefined
        )
      log(t('onboarder.configCreatedSkipGw'))
    }
  }

  // Stop immediately since onboard --install-daemon starts the daemon
  if (isMac) {
    const uid = process.getuid?.() ?? ''
    await new Promise<void>((resolve) => {
      const child = spawn('launchctl', ['bootout', `gui/${uid}/ai.openclaw.gateway`])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
    await new Promise<void>((resolve) => {
      const child = spawn('pkill', ['-9', '-f', 'openclaw-gateway'])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  // Set recommended model per provider
  const patchConfig = (ocConfig: Record<string, unknown>): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = ocConfig as any
    cfg.agents = cfg.agents ?? {}
    cfg.agents.defaults = cfg.agents.defaults ?? {}
    cfg.agents.defaults.model = {
      ...cfg.agents.defaults.model,
      primary:
        config.provider === 'ollama'
          ? ollamaPrimaryModelIdForConfig(config.modelId)
          : config.modelId || DEFAULT_MODELS[effectiveProvider]
    }
    // Avoid fixer/diagnostics noise: semantic memory needs extra embedding keys; off until user configures
    cfg.agents.defaults.memorySearch = {
      ...(typeof cfg.agents.defaults.memorySearch === 'object' && cfg.agents.defaults.memorySearch !== null
        ? cfg.agents.defaults.memorySearch
        : {}),
      enabled: false
    }
    // OAuth: register auth profile reference in config
    if (config.authMethod === 'oauth') {
      cfg.auth = cfg.auth ?? {}
      cfg.auth.profiles = {
        ...cfg.auth.profiles,
        [OAUTH_PROFILE_ID]: { provider: 'openai-codex', mode: 'oauth' }
      }
      cfg.auth.order = { ...cfg.auth.order, 'openai-codex': [OAUTH_PROFILE_ID] }
    }
    // DeepSeek: register custom provider (not built-in)
    if (config.provider === 'deepseek' && config.apiKey) {
      cfg.models = cfg.models ?? {}
      cfg.models.providers = cfg.models.providers ?? {}
      cfg.models.providers.deepseek = {
        baseUrl: 'https://api.deepseek.com/v1',
        api: 'openai-completions',
        apiKey: config.apiKey,
        models: DEEPSEEK_PROVIDER_MODELS.map((m) => ({ ...m }))
      }
    }
    const spec = MODEL_SPECS[config.provider]
    if (spec && cfg.models?.providers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const provider of Object.values(cfg.models.providers) as any[]) {
        if (Array.isArray(provider.models)) {
          for (const m of provider.models) {
            m.contextWindow = spec.contextWindow
            m.maxTokens = spec.maxTokens
          }
        }
      }
    }
  }

  // Patch config file
  if (isWindows) {
    try {
      const raw = await readWslFile('/root/.openclaw/openclaw.json')
      const ocConfig = JSON.parse(raw)
      patchConfig(ocConfig)
      await writeWslFile('/root/.openclaw/openclaw.json', JSON.stringify(ocConfig, null, 2))
    } catch {
      /* config not found — skip patch */
    }
  } else {
    const modelConfigPath = join(homedir(), '.openclaw', 'openclaw.json')
    if (existsSync(modelConfigPath)) {
      const ocConfig = JSON.parse(readFileSync(modelConfigPath, 'utf-8'))
      patchConfig(ocConfig)
      writeFileSync(modelConfigPath, JSON.stringify(ocConfig, null, 2), { mode: 0o600 })
    }
  }
  log(t('onboarder.basicDone'))

  // Apply IPv4 fix to plist (macOS only)
  if (isMac) {
    const plistAfter = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist')
    if (existsSync(plistAfter)) {
      let xml = readFileSync(plistAfter, 'utf-8')
      if (!xml.includes('ipv4-fix')) {
        xml = xml.replace(
          '<string>/usr/local/bin/node</string>',
          `<string>/usr/local/bin/node</string>\n      <string>--require=${fixPath}</string>`
        )
      }
      const nodeOpt = `--require=${fixPath}`
      if (!xml.includes('NODE_OPTIONS')) {
        xml = xml.replace(
          '</dict>\n  </dict>',
          `<key>NODE_OPTIONS</key>\n    <string>${nodeOpt}</string>\n    </dict>\n  </dict>`
        )
      }
      writeFileSync(plistAfter, xml)
    }
  }

  let botUsername: string | undefined

  if (config.telegramBotToken) {
    log(t('onboarder.addingTelegram'))
    const telegramChannel = {
      enabled: true,
      botToken: config.telegramBotToken,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groups: { '*': { requireMention: true } }
    }

    if (isWindows) {
      try {
        const raw = await readWslFile('/root/.openclaw/openclaw.json')
        const ocConfig = JSON.parse(raw)
        ocConfig.channels = { ...ocConfig.channels, telegram: telegramChannel }
        await writeWslFile('/root/.openclaw/openclaw.json', JSON.stringify(ocConfig, null, 2))
        log(t('onboarder.telegramDone'))
      } catch {
        log(t('onboarder.configNotFound'))
      }
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (existsSync(configPath)) {
        const ocConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
        ocConfig.channels = { ...ocConfig.channels, telegram: telegramChannel }
        writeFileSync(configPath, JSON.stringify(ocConfig, null, 2), { mode: 0o600 })
        log(t('onboarder.telegramDone'))
      } else {
        log(t('onboarder.configNotFound'))
      }
    }

    botUsername = await fetchBotUsername(config.telegramBotToken)
  }

  // ─── Zalo channel (Bot token OR Official Account OA pair) ───
  if (config.zaloBotToken) {
    log(t('onboarder.addingZalo'))
    const zaloChannel = {
      enabled: true,
      accounts: {
        default: {
          botToken: config.zaloBotToken
        }
      }
    }
    if (isWindows) {
      try {
        const raw = await readWslFile('/root/.openclaw/openclaw.json')
        const ocConfig = JSON.parse(raw)
        ocConfig.channels = { ...ocConfig.channels, zalo: zaloChannel }
        await writeWslFile('/root/.openclaw/openclaw.json', JSON.stringify(ocConfig, null, 2))
        log(t('onboarder.zaloDone'))
      } catch {
        log(t('onboarder.configNotFound'))
      }
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (existsSync(configPath)) {
        const ocConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
        ocConfig.channels = { ...ocConfig.channels, zalo: zaloChannel }
        writeFileSync(configPath, JSON.stringify(ocConfig, null, 2), { mode: 0o600 })
        log(t('onboarder.zaloDone'))
      } else {
        log(t('onboarder.configNotFound'))
      }
    }
  } else if (config.zaloOaId && config.zaloOaSecret) {
    log(t('onboarder.addingZalo'))
    const zaloChannel = {
      enabled: true,
      accounts: {
        default: {
          oaId: config.zaloOaId,
          oaSecret: config.zaloOaSecret
        }
      }
    }
    if (isWindows) {
      try {
        const raw = await readWslFile('/root/.openclaw/openclaw.json')
        const ocConfig = JSON.parse(raw)
        ocConfig.channels = { ...ocConfig.channels, zalo: zaloChannel }
        await writeWslFile('/root/.openclaw/openclaw.json', JSON.stringify(ocConfig, null, 2))
        log(t('onboarder.zaloDone'))
      } catch {
        log(t('onboarder.configNotFound'))
      }
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (existsSync(configPath)) {
        const ocConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
        ocConfig.channels = { ...ocConfig.channels, zalo: zaloChannel }
        writeFileSync(configPath, JSON.stringify(ocConfig, null, 2), { mode: 0o600 })
        log(t('onboarder.zaloDone'))
      } else {
        log(t('onboarder.configNotFound'))
      }
    }
  }

  // ─── Lark/Feishu channel ───
  if (config.larkAppId && config.larkAppSecret) {
    log(t('onboarder.addingLark'))
    const feishuChannel = {
      enabled: true,
      appId: config.larkAppId,
      appSecret: config.larkAppSecret
    }
    if (isWindows) {
      try {
        const raw = await readWslFile('/root/.openclaw/openclaw.json')
        const ocConfig = JSON.parse(raw)
        ocConfig.channels = { ...ocConfig.channels, feishu: feishuChannel }
        await writeWslFile('/root/.openclaw/openclaw.json', JSON.stringify(ocConfig, null, 2))
        log(t('onboarder.larkDone'))
      } catch {
        log(t('onboarder.configNotFound'))
      }
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (existsSync(configPath)) {
        const ocConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
        ocConfig.channels = { ...ocConfig.channels, feishu: feishuChannel }
        writeFileSync(configPath, JSON.stringify(ocConfig, null, 2), { mode: 0o600 })
        log(t('onboarder.larkDone'))
      } else {
        log(t('onboarder.configNotFound'))
      }
    }
  }

  if (config.telegramBotToken) {
    log(t('onboarder.checkingTelegram'))
    await waitTelegramClear(config.telegramBotToken)
  }

  // Restart daemon after all patches are complete
  if (isWindows) {
    log(t('onboarder.cleaningGateway'))
    await wslKillOpenclaw().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 2000))
  } else if (isMac) {
    log(t('onboarder.startingGateway'))
    const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist')
    const uid = process.getuid?.() ?? ''
    if (existsSync(plistPath)) {
      await new Promise<void>((resolve) => {
        const child = spawn('launchctl', ['bootstrap', `gui/${uid}`, plistPath])
        child.on('close', () => resolve())
        child.on('error', () => resolve())
      })
    }
  }

  // ─── NemoClaw Shield (Enchante app settings — not a separate CLI install) ───
  if (config.enableNemoShield) {
    log(t('onboarder.enablingNemo'))
    writeAppSettings({ nemoShieldEnabled: true })
    log(t('onboarder.nemoDone'))
  } else {
    writeAppSettings({ nemoShieldEnabled: false })
  }

  // ─── Skills ───
  if (config.selectedSkills && config.selectedSkills.length > 0) {
    log(t('onboarder.installingSkills'))
    for (let i = 0; i < config.selectedSkills.length; i++) {
      const skill = config.selectedSkills[i]
      if (i > 0) await sleep(4200)
      log(t('onboarder.installingSkill', { skill }))
      try {
        await installClawhubSkillWithRetries(skill, runCmd, log, isWindows)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        log(`⚠ ${skill}: ${errMsg}`)
      }
    }
  }

  if (config.bundledSkillSelections && config.bundledSkillSelections.length > 0) {
    try {
      await installBundledSkillSelections(config.bundledSkillSelections, log)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log(`⚠ bundled skills: ${errMsg}`)
    }
  }

  const configuredChannels: string[] = []
  if (config.telegramBotToken) configuredChannels.push('telegram')
  if (config.zaloBotToken || config.zaloOaId) configuredChannels.push('zalo')
  if (config.larkAppId) configuredChannels.push('lark')

  return {
    botUsername,
    configuredChannels,
    ...(isWindows && config.provider === 'ollama' ? { ollamaSetupLog } : {})
  }
}

// ─── Provider switch ───

export interface CurrentConfig {
  provider?: string
  model?: string
  hasTelegram?: boolean
  hasZalo?: boolean
  hasLark?: boolean
}

export const readCurrentConfig = async (): Promise<CurrentConfig | null> => {
  const isWindows = platform() === 'win32'
  try {
    let raw: string
    if (isWindows) {
      raw = await readWslFile('/root/.openclaw/openclaw.json')
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (!existsSync(configPath)) return null
      raw = readFileSync(configPath, 'utf-8')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = JSON.parse(raw) as any
    const model = cfg?.agents?.defaults?.model?.primary as string | undefined
    const hasTelegram = !!cfg?.channels?.telegram?.botToken
    const zDef = cfg?.channels?.zalo?.accounts?.default
    const hasZalo = !!(zDef?.oaId || zDef?.botToken)
    const hasLark = !!cfg?.channels?.feishu?.appId
    const provider = model?.split('/')[0]
    return { provider, model, hasTelegram, hasZalo, hasLark }
  } catch {
    return null
  }
}

export const switchProvider = async (
  win: BrowserWindow,
  config: {
    provider: OnboardConfig['provider']
    apiKey?: string
    authMethod?: 'api-key' | 'oauth'
    modelId?: string
  }
): Promise<void> => {
  const log = (msg: string): void => {
    win.webContents.send('install:progress', msg)
  }

  const isWindows = platform() === 'win32'
  const isMac = platform() === 'darwin'
  const ocBin = isWindows ? 'openclaw' : findBin('openclaw')
  const runCmd = createRunCmd()

  log(t('onboarder.switchStarting'))

  // 1. Preserve existing channels
  let savedTelegram: Record<string, unknown> | null = null
  let savedZalo: Record<string, unknown> | null = null
  let savedLark: Record<string, unknown> | null = null
  try {
    let raw: string
    if (isWindows) {
      raw = await readWslFile('/root/.openclaw/openclaw.json')
    } else {
      raw = readFileSync(join(homedir(), '.openclaw', 'openclaw.json'), 'utf-8')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = JSON.parse(raw) as any
    if (cfg?.channels?.telegram?.botToken) savedTelegram = cfg.channels.telegram
    if (cfg?.channels?.zalo) savedZalo = cfg.channels.zalo
    if (cfg?.channels?.feishu) savedLark = cfg.channels.feishu
  } catch {
    /* no config yet */
  }

  // 2. Prevent Telegram 409 conflict
  if (savedTelegram && (savedTelegram as { botToken?: string }).botToken) {
    log(t('onboarder.cleaningTelegram'))
    await waitTelegramClear((savedTelegram as { botToken: string }).botToken)
  }

  // 3. Clean up existing processes
  log(t('onboarder.cleaningGateway'))
  if (isWindows) {
    await wslKillOpenclaw().catch(() => {})
  } else {
    await new Promise<void>((resolve) => {
      const child = spawn('pkill', ['-9', '-f', 'openclaw'])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // 4. Delete existing config/auth files (preserve auth-profiles.json for OAuth)
  const preserveAuthProfiles = config.authMethod === 'oauth'
  if (isWindows) {
    try {
      await runInWsl('rm -f /root/.openclaw/openclaw.json')
    } catch {
      /* ignore */
    }
    const wslAuthClean = preserveAuthProfiles
      ? 'rm -f /root/.openclaw/agents/main/agent/auth.json'
      : 'rm -f /root/.openclaw/agents/main/agent/auth.json /root/.openclaw/agents/main/agent/auth-profiles.json'
    try {
      await runInWsl(wslAuthClean)
    } catch {
      /* ignore */
    }
  } else {
    const ocDir = join(homedir(), '.openclaw')
    const filesToClean = [
      'openclaw.json',
      join('agents', 'main', 'agent', 'auth.json'),
      ...(preserveAuthProfiles ? [] : [join('agents', 'main', 'agent', 'auth-profiles.json')])
    ]
    for (const f of filesToClean) {
      const p = join(ocDir, f)
      if (existsSync(p))
        try {
          unlinkSync(p)
        } catch {
          /* ignore */
        }
    }
  }

  // 5. Re-run openclaw onboard
  log(t('onboarder.settingNewProvider'))
  // OAuth: credentials already saved to auth-profiles.json, skip auth in onboard
  const effectiveProvider = config.authMethod === 'oauth' ? 'openai-codex' : config.provider
  const effectiveAuthFlags =
    config.authMethod === 'oauth'
      ? ['--auth-choice', 'skip']
      : config.provider === 'ollama'
        ? ['--auth-choice', 'ollama']
        : config.provider === 'deepseek'
          ? ['--auth-choice', 'skip']
          : {
              anthropic: ['--auth-choice', 'apiKey', '--anthropic-api-key', config.apiKey!],
              google: ['--auth-choice', 'gemini-api-key', '--gemini-api-key', config.apiKey!],
              openai: ['--auth-choice', 'openai-api-key', '--openai-api-key', config.apiKey!],
              minimax: ['--auth-choice', 'minimax-api', '--minimax-api-key', config.apiKey!],
              glm: ['--auth-choice', 'zai-api-key', '--zai-api-key', config.apiKey!]
            }[config.provider]

  let switchWslOllamaExtras: string[] = []
  if (isWindows && config.provider === 'ollama') {
    const ollamaBuilt = await buildWindowsWslOllamaOnboardCliExtras(config.modelId, log)
    switchWslOllamaExtras = ollamaBuilt.extras
  }

  const openclawArgs = [
    'onboard',
    '--non-interactive',
    '--accept-risk',
    '--mode',
    'local',
    ...effectiveAuthFlags,
    ...switchWslOllamaExtras,
    ...(config.provider === 'ollama' && !isWindows
      ? (['--custom-model-id', ollamaPullTagForOnboard(config.modelId)] as const)
      : []),
    '--gateway-port',
    '18789',
    '--gateway-bind',
    'loopback',
    ...(isWindows ? ['--skip-health'] : ['--install-daemon', '--daemon-runtime', 'node']),
    '--skip-skills'
  ]

  if (isWindows) {
    try {
      await runInWsl(
        `${buildWslPathOnlyPrefix()} && mkdir -p /root/.openclaw /root/.openclaw/workspace`,
        20000
      )
    } catch {
      /* ignore */
    }
  }

  try {
    await runCmd(
      isWindows ? 'npm' : ocBin,
      isWindows ? ['exec', '--', 'openclaw', ...openclawArgs] : [...openclawArgs],
      log
    )
  } catch (e) {
    if (isWindows) {
      try {
        await readWslFile('/root/.openclaw/openclaw.json')
      } catch {
        throw e
      }
    } else {
      if (!existsSync(join(homedir(), '.openclaw', 'openclaw.json'))) throw e
    }
    log(t('onboarder.configCreatedSkipGw'))
  }

  // 6. Stop daemon immediately (macOS)
  if (isMac) {
    const uid = process.getuid?.() ?? ''
    await new Promise<void>((resolve) => {
      const child = spawn('launchctl', ['bootout', `gui/${uid}/ai.openclaw.gateway`])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
    await new Promise<void>((resolve) => {
      const child = spawn('pkill', ['-9', '-f', 'openclaw-gateway'])
      child.on('close', () => resolve())
      child.on('error', () => resolve())
    })
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  // 7. Patch model
  log(t('onboarder.applyingModel'))

  const patchSwitchConfig = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ocConfig: any,
    telegram: Record<string, unknown> | null,
    zalo: Record<string, unknown> | null,
    lark: Record<string, unknown> | null
  ): void => {
    ocConfig.agents = ocConfig.agents ?? {}
    ocConfig.agents.defaults = ocConfig.agents.defaults ?? {}
    ocConfig.agents.defaults.model = {
      ...ocConfig.agents.defaults.model,
      primary:
        config.provider === 'ollama'
          ? ollamaPrimaryModelIdForConfig(config.modelId)
          : config.modelId || DEFAULT_MODELS[effectiveProvider]
    }
    ocConfig.agents.defaults.memorySearch = {
      ...(typeof ocConfig.agents.defaults.memorySearch === 'object' &&
      ocConfig.agents.defaults.memorySearch !== null
        ? ocConfig.agents.defaults.memorySearch
        : {}),
      enabled: false
    }
    // OAuth: register auth profile reference in config
    if (config.authMethod === 'oauth') {
      ocConfig.auth = ocConfig.auth ?? {}
      ocConfig.auth.profiles = {
        ...ocConfig.auth.profiles,
        [OAUTH_PROFILE_ID]: { provider: 'openai-codex', mode: 'oauth' }
      }
      ocConfig.auth.order = { ...ocConfig.auth.order, 'openai-codex': [OAUTH_PROFILE_ID] }
    }
    // DeepSeek: register custom provider (not built-in)
    if (config.provider === 'deepseek' && config.apiKey) {
      ocConfig.models = ocConfig.models ?? {}
      ocConfig.models.providers = ocConfig.models.providers ?? {}
      ocConfig.models.providers.deepseek = {
        baseUrl: 'https://api.deepseek.com/v1',
        api: 'openai-completions',
        apiKey: config.apiKey,
        models: DEEPSEEK_PROVIDER_MODELS.map((m) => ({ ...m }))
      }
    }
    const spec = MODEL_SPECS[effectiveProvider as OnboardConfig['provider']]
    if (spec && ocConfig.models?.providers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const provider of Object.values(ocConfig.models.providers) as any[]) {
        if (Array.isArray(provider.models)) {
          for (const m of provider.models) {
            m.contextWindow = spec.contextWindow
            m.maxTokens = spec.maxTokens
          }
        }
      }
    }
    // Restore channels
    if (telegram) ocConfig.channels = { ...ocConfig.channels, telegram }
    if (zalo) ocConfig.channels = { ...ocConfig.channels, zalo }
    if (lark) ocConfig.channels = { ...ocConfig.channels, feishu: lark }
  }

  if (isWindows) {
    try {
      const raw = await readWslFile('/root/.openclaw/openclaw.json')
      const ocConfig = JSON.parse(raw)
      patchSwitchConfig(ocConfig, savedTelegram, savedZalo, savedLark)
      await writeWslFile('/root/.openclaw/openclaw.json', JSON.stringify(ocConfig, null, 2))
    } catch {
      /* config not found */
    }
  } else {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    if (existsSync(configPath)) {
      const ocConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
      patchSwitchConfig(ocConfig, savedTelegram, savedZalo, savedLark)
      writeFileSync(configPath, JSON.stringify(ocConfig, null, 2), { mode: 0o600 })
    }
  }

  log(t('onboarder.switchDone'))
}

// ─── Security status ───

export const readSecurityStatus = async (): Promise<{
  nemoShieldEnabled: boolean
}> => {
  const { readAppSettings } = await import('./app-settings')
  const appSettings = readAppSettings()
  return {
    nemoShieldEnabled: appSettings.nemoShieldEnabled === true
  }
}
