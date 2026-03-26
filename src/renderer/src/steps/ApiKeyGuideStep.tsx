import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { OllamaPreflight } from '@shared/ollama-preflight'
import Button from '../components/Button'
import LogViewer from '../components/LogViewer'
import OllamaPreflightPanel from '../components/OllamaPreflightPanel'
import { OllamaWindowsManualGuide } from '../components/OllamaWindowsManualGuide'
import { OLLAMA_DOWNLOAD_URL } from '../constants/openclaw'
import { useInstallLogs } from '../hooks/useIpc'
import { providerConfigs, type Provider, type AuthMethod } from '../constants/providers'
import { splitInstallProgressMessages } from '@shared/install-log-format'

/** Prefer `install.probeOllamaApi` (same bridge namespace as legacy `install.ollama`). */
async function invokeOllamaProbeFromRenderer(opts?: {
  tryBringUp?: boolean
}): Promise<{ listening: boolean; diagnostics: string[] }> {
  const normalize = (r: { listening: boolean; diagnostics?: string[] }) => ({
    listening: r.listening,
    diagnostics: Array.isArray(r.diagnostics) ? r.diagnostics : []
  })
  const primary = window.electronAPI.install.probeOllamaApi
  if (typeof primary === 'function') return normalize(await primary(opts))
  const legacy = window.electronAPI.ollama?.probeWslLocalhost
  if (typeof legacy === 'function') return normalize(await legacy(opts))
  throw new Error('no-bridge')
}

const providerPatterns: Record<Provider, RegExp> = {
  anthropic: /^sk-ant-/,
  google: /^AIza/,
  openai: /^sk-(?!ant-)/,
  minimax: /^sk-/,
  glm: /^.{8,}$/,
  deepseek: /^sk-/,
  ollama: /^$/
}

const providerMeta: Record<Provider, { name: string; consoleUrl: string }> = {
  google: {
    name: 'Google Gemini',
    consoleUrl: 'https://aistudio.google.com/apikey'
  },
  openai: {
    name: 'OpenAI',
    consoleUrl: 'https://platform.openai.com/api-keys'
  },
  anthropic: {
    name: 'Anthropic',
    consoleUrl: 'https://console.anthropic.com/settings/keys'
  },
  minimax: {
    name: 'MiniMax',
    consoleUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key'
  },
  glm: {
    name: 'Z.AI (智谱)',
    consoleUrl: 'https://z.ai/manage-apikey/apikey-list'
  },
  deepseek: {
    name: 'DeepSeek',
    consoleUrl: 'https://platform.deepseek.com/api_keys'
  },
  ollama: {
    name: 'Ollama',
    consoleUrl: 'https://ollama.com/download'
  }
}

/** Ollama first — default provider on this step */
const providerOrder: Provider[] = [
  'ollama',
  'google',
  'openai',
  'anthropic',
  'deepseek',
  'minimax',
  'glm'
]

interface Props {
  provider: Provider
  onSelectProvider: (p: Provider) => void
  authMethod: AuthMethod
  onSelectAuthMethod: (m: AuthMethod) => void
  modelId?: string
  onSelectModel: (id: string) => void
  apiKey: string
  onApiKeyChange: (v: string) => void
  oauthCompleted: boolean
  onOauthCompleted: (v: boolean) => void
  onNext: () => void
  isWindows?: boolean
  hostOs?: 'macos' | 'windows' | 'linux'
}

export default function ApiKeyGuideStep({
  provider,
  onSelectProvider,
  authMethod,
  onSelectAuthMethod,
  modelId,
  onSelectModel,
  apiKey,
  onApiKeyChange,
  oauthCompleted,
  onOauthCompleted,
  onNext,
  isWindows = false,
  hostOs = 'windows'
}: Props): React.JSX.Element {
  const { t } = useTranslation('steps')
  const { t: tp } = useTranslation('providers')
  const { logs, error, clearLogs } = useInstallLogs()
  const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null)
  const [ollamaChecking, setOllamaChecking] = useState(false)
  const [ollamaRefreshing, setOllamaRefreshing] = useState(false)
  /** macOS/Linux only: optional Homebrew / install.sh path (Windows uses manual steps). */
  const [ollamaAutomatedInstalling, setOllamaAutomatedInstalling] = useState(false)
  const [ollamaSys, setOllamaSys] = useState<{
    os: 'macos' | 'windows' | 'linux'
    preflight: OllamaPreflight
    wslState?: string
  } | null>(null)
  const [ollamaPreflightFailed, setOllamaPreflightFailed] = useState(false)
  const [ollamaFolderDraft, setOllamaFolderDraft] = useState('')
  const [ollamaPathBusy, setOllamaPathBusy] = useState(false)
  const [ollamaPathNote, setOllamaPathNote] = useState('')
  /** Windows WSL: HTTP 127.0.0.1:11434 reachable from the app (null = not probed yet). */
  const [ollamaWslApiReachable, setOllamaWslApiReachable] = useState<boolean | null>(null)
  const [ollamaApiProbing, setOllamaApiProbing] = useState(false)
  /** Shown when manual Check API fails for bridge/timeout (auto-probe stays silent). */
  const [ollamaProbeUiNote, setOllamaProbeUiNote] = useState('')
  const [ollamaDiagCopied, setOllamaDiagCopied] = useState(false)
  /** True while manual Check API runs the WSL bring-up path (longer than a quick probe). */
  const [ollamaManualBringUpProbe, setOllamaManualBringUpProbe] = useState(false)
  /** Last probe diagnostics from main (WSL facts, bring-up steps) — no terminal needed. */
  const [ollamaProbeDiagnostics, setOllamaProbeDiagnostics] = useState<string[]>([])

  const meta = providerMeta[provider]
  const providerConfig = providerConfigs.find((p) => p.id === provider)!
  const activeModels =
    provider === 'openai' && authMethod === 'oauth'
      ? (providerConfig.oauthModels ?? providerConfig.models)
      : providerConfig.models
  const selectedModelId = modelId ?? activeModels[0]!.id

  const isOAuth = authMethod === 'oauth'
  const isOllama = provider === 'ollama'
  const pattern = providerPatterns[provider]
  const apiKeyValid = pattern.test(apiKey)
  const label = t(`config.apiKeyLabel.${provider}`)
  const placeholder = tp(`apiKeyPlaceholder.${provider}`, providerPlaceholders(provider))

  useEffect(() => {
    if (provider !== 'ollama') {
      setOllamaWslApiReachable(null)
      setOllamaApiProbing(false)
      setOllamaProbeUiNote('')
      setOllamaManualBringUpProbe(false)
      setOllamaProbeDiagnostics([])
      return
    }
    let cancelled = false
    setOllamaChecking(true)
    setOllamaPreflightFailed(false)
    void window.electronAPI.env
      .check()
      .then((e) => {
        if (!cancelled) {
          setOllamaInstalled(e.ollamaInstalled)
          setOllamaSys({
            os: e.os,
            preflight: e.ollamaPreflight,
            wslState: e.wslState
          })
          setOllamaPreflightFailed(false)
          setOllamaFolderDraft((prev) => prev || (e.ollamaPreflight.ollamaModelsWinPath ?? ''))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOllamaInstalled(false)
          setOllamaSys(null)
          setOllamaPreflightFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setOllamaChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => {
    if (!isOllama || !isWindows) return
    if (ollamaChecking || ollamaRefreshing || ollamaAutomatedInstalling) return
    if (ollamaInstalled !== true) return
    if (ollamaWslApiReachable !== null) return
    let cancelled = false
    setOllamaApiProbing(true)
    void Promise.race([
      invokeOllamaProbeFromRenderer(),
      new Promise<{ listening: boolean; diagnostics: string[] }>((resolve) =>
        setTimeout(() => resolve({ listening: false, diagnostics: ['(Auto-check timed out after 24s.)'] }), 24_000)
      )
    ])
      .then((probe) => {
        if (!cancelled) {
          setOllamaWslApiReachable(probe.listening)
          setOllamaProbeDiagnostics(probe.listening ? [] : (probe.diagnostics ?? []))
        }
      })
      .catch(() => {
        if (!cancelled) setOllamaWslApiReachable(false)
      })
      .finally(() => {
        if (!cancelled) setOllamaApiProbing(false)
      })
    return () => {
      cancelled = true
      setOllamaApiProbing(false)
    }
  }, [
    isOllama,
    isWindows,
    ollamaChecking,
    ollamaRefreshing,
    ollamaAutomatedInstalling,
    ollamaInstalled,
    ollamaWslApiReachable
  ])

  const handleRecheckOllamaApi = useCallback(async (): Promise<void> => {
    if (!isWindows) return
    setOllamaProbeUiNote('')
    setOllamaManualBringUpProbe(true)
    setOllamaApiProbing(true)
    try {
      const probe = await Promise.race([
        invokeOllamaProbeFromRenderer({ tryBringUp: true }),
        new Promise<{ listening: boolean; diagnostics: string[] }>((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), 130_000)
        )
      ])
      setOllamaWslApiReachable(probe.listening)
      setOllamaProbeDiagnostics(probe.listening ? [] : (probe.diagnostics ?? []))
    } catch (e) {
      if (e instanceof Error && e.message === 'timeout') {
        setOllamaProbeUiNote(t('apiKeyGuide.ollamaProbeTimedOut'))
        setOllamaProbeDiagnostics((d) =>
          d.length ? d : ['(Check API waited ~2 minutes then stopped — see message above.)']
        )
      } else if (e instanceof Error && e.message === 'no-bridge') {
        setOllamaProbeUiNote(t('apiKeyGuide.ollamaProbeUnavailable'))
      } else {
        setOllamaWslApiReachable(false)
      }
    } finally {
      setOllamaApiProbing(false)
      setOllamaManualBringUpProbe(false)
    }
  }, [isWindows, t])

  const handleOllamaRefreshCheck = useCallback(async (): Promise<void> => {
    clearLogs()
    setOllamaProbeUiNote('')
    setOllamaProbeDiagnostics([])
    if (isWindows) setOllamaWslApiReachable(null)
    setOllamaRefreshing(true)
    try {
      const e = await window.electronAPI.env.check()
      setOllamaInstalled(e.ollamaInstalled)
      setOllamaSys({
        os: e.os,
        preflight: e.ollamaPreflight,
        wslState: e.wslState
      })
      setOllamaPreflightFailed(false)
      setOllamaFolderDraft((prev) => prev || (e.ollamaPreflight.ollamaModelsWinPath ?? ''))
    } catch {
      if (isWindows) setOllamaWslApiReachable(null)
    } finally {
      setOllamaRefreshing(false)
    }
  }, [clearLogs, isWindows])

  const handleOllamaAutomatedInstall = useCallback(async (): Promise<void> => {
    if (isWindows) return
    clearLogs()
    setOllamaProbeUiNote('')
    setOllamaProbeDiagnostics([])
    setOllamaAutomatedInstalling(true)
    try {
      const r = await window.electronAPI.install.ollama()
      if (!r.success) throw new Error(r.error)
      const e = await window.electronAPI.env.check()
      setOllamaInstalled(e.ollamaInstalled)
      setOllamaSys({
        os: e.os,
        preflight: e.ollamaPreflight,
        wslState: e.wslState
      })
      setOllamaPreflightFailed(false)
      setOllamaFolderDraft((prev) => prev || (e.ollamaPreflight.ollamaModelsWinPath ?? ''))
    } catch {
      /* IPC install:onError surfaces message */
    } finally {
      setOllamaAutomatedInstalling(false)
    }
  }, [clearLogs, isWindows])

  const pickOllamaFolder = useCallback(async (): Promise<void> => {
    const r = await window.electronAPI.dialog.pickOllamaModelsFolder()
    if (!r.canceled) setOllamaFolderDraft(r.path)
  }, [])

  const saveOllamaFolder = useCallback(async (): Promise<void> => {
    setOllamaPathBusy(true)
    setOllamaPathNote('')
    try {
      const setr = await window.electronAPI.settings.setOllamaModelsWinPath(ollamaFolderDraft.trim())
      if (!setr.ok) {
        setOllamaPathNote(setr.error ?? t('apiKeyGuide.ollamaModelsPath.error'))
        return
      }
      const ap = await window.electronAPI.install.applyOllamaWslEnv()
      if (!ap.success) {
        setOllamaPathNote(ap.error ?? t('apiKeyGuide.ollamaModelsPath.error'))
        return
      }
      const e = await window.electronAPI.env.check()
      setOllamaSys({
        os: e.os,
        preflight: e.ollamaPreflight,
        wslState: e.wslState
      })
      setOllamaFolderDraft(e.ollamaPreflight.ollamaModelsWinPath ?? '')
      setOllamaPathNote(t('apiKeyGuide.ollamaModelsPath.saved'))
    } finally {
      setOllamaPathBusy(false)
    }
  }, [ollamaFolderDraft, t])

  /** Windows: allow Next once Ollama is detected installed; API probe is advisory (user may fix OLLAMA_HOST / firewall later). */
  const providerReady = isOAuth
    ? oauthCompleted
    : isOllama
      ? isWindows
        ? ollamaInstalled === true &&
          !ollamaChecking &&
          !ollamaRefreshing &&
          !ollamaAutomatedInstalling &&
          !ollamaApiProbing
        : ollamaInstalled === true && !ollamaAutomatedInstalling
      : apiKeyValid

  const handleOAuthLogin = async (): Promise<void> => {
    try {
      const result = await window.electronAPI.oauth.loginCodex()
      if (result.success) {
        onOauthCompleted(true)
      }
    } catch {
      /* ignore */
    }
  }

  const handleNext = (): void => {
    if (!providerReady) return
    onSelectModel(selectedModelId)
    onNext()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-8 pb-2">
      <div className="shrink-0 text-center space-y-0.5 pt-2 pb-1.5">
        <h2 className="text-lg font-extrabold">{t('apiKeyGuide.title')}</h2>
        <p className="text-text-muted text-xs">{t('apiKeyGuide.desc')}</p>
      </div>

      <div className="shrink-0 flex rounded-xl border border-glass-border overflow-hidden bg-bg-card">
        {providerOrder.map((p, i) => (
          <button
            key={p}
            onClick={() => onSelectProvider(p)}
            className={`flex-1 py-2 text-center transition-colors duration-200 cursor-pointer ${
              i > 0 ? 'border-l border-glass-border' : ''
            } ${provider === p ? 'bg-primary/12 text-text' : 'hover:bg-white/5 text-text-muted'}`}
          >
            <p className={`text-[11px] font-bold leading-tight ${provider === p ? 'text-primary' : ''}`}>
              {providerMeta[p].name}
            </p>
          </button>
        ))}
      </div>

      {providerConfig.authMethods && (
        <div className="shrink-0 flex rounded-lg border border-glass-border overflow-hidden bg-bg-card mt-2">
          {providerConfig.authMethods.map((m) => (
            <button
              key={m}
              onClick={() => {
                onSelectAuthMethod(m)
                onOauthCompleted(false)
                onSelectModel(
                  m === 'oauth'
                    ? (providerConfig.oauthModels?.[0]?.id ?? providerConfig.models[0].id)
                    : providerConfig.models[0].id
                )
              }}
              className={`flex-1 py-1.5 text-center text-[11px] font-bold transition-colors duration-200 cursor-pointer ${
                authMethod === m ? 'bg-primary/12 text-primary' : 'hover:bg-white/5 text-text-muted'
              }`}
            >
              {t(`apiKeyGuide.authMethod.${m}`)}
            </button>
          ))}
        </div>
      )}

      {provider === 'openai' && authMethod === 'oauth' && (
        <p className="shrink-0 text-[11px] text-text-muted mt-1">{t('apiKeyGuide.oauthDesc')}</p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain mt-2 pr-1 space-y-3 pb-3 [scrollbar-gutter:stable]">
        {/* Provider API key / OAuth / Ollama — scrolls above footer nav */}
        <div className="space-y-2">
          {isOllama ? (
            <div className="space-y-2">
              <OllamaPreflightPanel
                os={ollamaSys?.os ?? hostOs}
                preflight={ollamaSys?.preflight}
                wslState={ollamaSys?.wslState}
                loading={ollamaChecking}
                loadFailed={ollamaPreflightFailed}
              />
              {isWindows && (
                <div className="rounded-xl border border-glass-border bg-bg-card/80 p-3 space-y-2">
                  <label className="text-[11px] font-bold text-text">{t('apiKeyGuide.ollamaModelsPath.title')}</label>
                  <p className="text-[10px] text-text-muted leading-snug">{t('apiKeyGuide.ollamaModelsPath.help')}</p>
                  <div className="flex gap-2 min-w-0">
                    <input
                      type="text"
                      value={ollamaFolderDraft}
                      onChange={(e) => setOllamaFolderDraft(e.target.value)}
                      placeholder={t('apiKeyGuide.ollamaModelsPath.placeholder')}
                      className="min-w-0 flex-1 bg-bg-input rounded-lg px-2.5 py-1.5 text-[11px] font-mono outline-none border border-glass-border focus:border-primary"
                    />
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => void pickOllamaFolder()}>
                      {t('apiKeyGuide.ollamaModelsPath.browse')}
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={ollamaPathBusy}
                    disabled={ollamaPathBusy || ollamaChecking}
                    onClick={() => void saveOllamaFolder()}
                  >
                    {t('apiKeyGuide.ollamaModelsPath.saveApply')}
                  </Button>
                  {ollamaPathNote ? (
                    <p className="text-[10px] text-text-muted break-words">{ollamaPathNote}</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : isOAuth ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold">OpenAI {t('apiKeyGuide.authMethod.oauth')}</label>
              {oauthCompleted ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/30 rounded-xl text-xs">
                  <span className="text-success font-medium">{t('config.oauthSuccess')}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleOAuthLogin}
                  className="w-full py-2 text-xs font-semibold rounded-xl bg-white/5 border border-glass-border hover:bg-white/10"
                >
                  {t('config.oauthLogin')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-bold">
                {label} <span className="text-error text-[10px]">{t('config.required')}</span>
              </label>
              <input
                type="password"
                placeholder={placeholder}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className={`w-full bg-bg-input rounded-xl px-3 py-2 text-xs font-mono outline-none border transition-all ${
                  apiKey && !apiKeyValid
                    ? 'border-error/50'
                    : 'border-glass-border focus:border-primary focus:shadow-[0_0_0_2px_var(--color-primary-glow)]'
                }`}
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold text-text-muted mb-1">{t('apiKeyGuide.modelSelect')}</label>
          <div className="space-y-1">
            {activeModels.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModel(m.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                  selectedModelId === m.id
                    ? 'bg-primary/12 border border-primary/50'
                    : 'bg-white/5 border border-transparent hover:bg-white/8'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                    selectedModelId === m.id ? 'border-primary bg-primary' : 'border-text-muted/30'
                  }`}
                />
                <div className="min-w-0 flex-1 flex items-baseline gap-1 flex-wrap">
                  <span className="text-sm font-bold">{m.name}</span>
                  <span className="text-[11px] text-text-muted/70">{tp(`desc.${m.id}`, m.desc)}</span>
                  {m.price && (
                    <span className="text-[10px] text-text-muted/40 font-mono ml-auto">{m.price}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          {provider !== 'ollama' && !(provider === 'openai' && authMethod === 'oauth') && (
            <a
              href={meta.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs font-semibold bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent py-2"
            >
              {t(`apiKeyGuide.getApiKey.${provider}`)} →
            </a>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1 border-t border-glass-border/40">
          {isOllama && (
            <div className="space-y-2">
              {ollamaChecking && (
                <p className="text-text-muted text-center text-[10px]">{t('apiKeyGuide.ollamaChecking')}</p>
              )}
              {!ollamaChecking && ollamaInstalled === false && isWindows && (
                <div className="space-y-2">
                  <OllamaWindowsManualGuide showHeading={false} />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={ollamaRefreshing}
                    disabled={ollamaRefreshing || ollamaAutomatedInstalling}
                    onClick={() => void handleOllamaRefreshCheck()}
                  >
                    {t('apiKeyGuide.ollamaCheckAgainBtn')}
                  </Button>
                </div>
              )}
              {!ollamaChecking && ollamaInstalled === false && !isWindows && (
                <div className="space-y-2">
                  <p className="text-center text-[10px] text-text-muted leading-snug px-1">
                    {t('apiKeyGuide.ollamaManualMacLinuxLead')}
                  </p>
                  <a
                    href={OLLAMA_DOWNLOAD_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-[11px] font-bold text-primary underline decoration-primary/40"
                  >
                    {t('config.ollamaGuide.downloadCta')} →
                  </a>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full flex-1"
                      loading={ollamaAutomatedInstalling}
                      disabled={ollamaAutomatedInstalling || ollamaRefreshing}
                      onClick={() => void handleOllamaAutomatedInstall()}
                    >
                      {t('apiKeyGuide.ollamaAutomatedInstallBtn')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full flex-1"
                      loading={ollamaRefreshing}
                      disabled={ollamaRefreshing || ollamaAutomatedInstalling}
                      onClick={() => void handleOllamaRefreshCheck()}
                    >
                      {t('apiKeyGuide.ollamaCheckAgainBtn')}
                    </Button>
                  </div>
                </div>
              )}
              {!ollamaChecking && ollamaInstalled === true && isWindows && (ollamaWslApiReachable === null || ollamaApiProbing) && (
                <p className="text-center text-[10px] text-text-muted">
                  {ollamaManualBringUpProbe
                    ? t('apiKeyGuide.ollamaApiProbingBringUp')
                    : t('apiKeyGuide.ollamaApiProbing')}
                </p>
              )}
              {!ollamaChecking && ollamaInstalled === true && isWindows && ollamaWslApiReachable === true && !ollamaApiProbing && (
                <p className="text-center text-[10px] font-semibold text-[var(--color-success)]">
                  {t('apiKeyGuide.ollamaApiReady')}
                </p>
              )}
              {!ollamaChecking && ollamaInstalled === true && isWindows && ollamaWslApiReachable === false && (
                <div className="space-y-1.5">
                  <p className="text-center text-[10px] font-medium text-warning leading-snug px-1">
                    {t('apiKeyGuide.ollamaApiBlocked')}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={ollamaApiProbing}
                    disabled={ollamaApiProbing}
                    onClick={(ev) => {
                      ev.preventDefault()
                      ev.stopPropagation()
                      void handleRecheckOllamaApi()
                    }}
                  >
                    {t('apiKeyGuide.ollamaCheckApiBtn')}
                  </Button>
                  {ollamaProbeUiNote ? (
                    <p className="text-center text-[10px] text-error font-medium leading-snug px-1">{ollamaProbeUiNote}</p>
                  ) : null}
                </div>
              )}
              {isWindows && ollamaInstalled === true && ollamaProbeDiagnostics.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <p className="text-[10px] font-bold text-text-muted min-w-0">{t('apiKeyGuide.ollamaDiagnosticsTitle')}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 px-2 py-0.5 text-[10px]"
                      onClick={() => {
                        void navigator.clipboard.writeText(ollamaProbeDiagnostics.join('\n')).then(() => {
                          setOllamaDiagCopied(true)
                          window.setTimeout(() => setOllamaDiagCopied(false), 2000)
                        })
                      }}
                    >
                      {ollamaDiagCopied ? t('apiKeyGuide.ollamaDiagnosticsCopied') : t('apiKeyGuide.ollamaDiagnosticsCopyBtn')}
                    </Button>
                  </div>
                  <LogViewer lines={ollamaProbeDiagnostics} />
                </div>
              )}
              {!ollamaChecking && ollamaInstalled === true && !isWindows && (
                <p className="text-center text-[10px] font-semibold text-[var(--color-success)]">
                  {t('apiKeyGuide.ollamaReady')}
                </p>
              )}
              {(ollamaAutomatedInstalling || (isOllama && logs.length > 0)) && <LogViewer lines={logs} />}
              {isOllama && !isWindows && ollamaAutomatedInstalling && logs.length > 0 && (
                <p className="text-text-muted px-1 text-center text-[9px] leading-snug">
                  {t('apiKeyGuide.ollamaWslLogHint')}
                </p>
              )}
              {isOllama && error && (
                <div className="text-error space-y-1 text-center text-[10px] font-medium">
                  {splitInstallProgressMessages(error).map((line, i) => (
                    <p key={i} className="break-all">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleNext}
              disabled={!providerReady || (isOllama && ollamaChecking)}
            >
              {isOllama ? t('install.nextBtn') : t('apiKeyGuide.keyReady')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function providerPlaceholders(p: Provider): string {
  const map: Record<Provider, string> = {
    anthropic: 'sk-ant-...',
    google: 'AIza...',
    openai: 'sk-...',
    minimax: 'sk-...',
    glm: 'API Key',
    deepseek: 'sk-...',
    ollama: ''
  }
  return map[p]
}
