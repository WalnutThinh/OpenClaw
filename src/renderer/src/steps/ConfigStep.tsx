import { useState, useMemo, useEffect, useRef } from 'react'
import { playConfigSavedChime } from '../utils/play-notification-sound'
import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import { OllamaWindowsPrepCard, OllamaWslIssueGuide } from '../components/OllamaWindowsUserGuide'
import GmailAppPasswordLinks from '../components/GmailAppPasswordLinks'
import ZaloPairingPanel from '../components/ZaloPairingPanel'
import LogViewer from '../components/LogViewer'
import LogViewerTabs, { type LogTabId } from '../components/LogViewerTabs'
import { BUNDLED_EMAIL_SKILL_ID, BUNDLED_GOOGLE_WORKSPACE_SKILL_ID } from '../constants/bundled-skills'
import { ZALO_OA_ENABLED } from '../constants/channels'
import { splitLogLines } from '../utils/gateway-log-split'
import { smtpErrorUserHint } from '../utils/smtp-errors'
import { useInstallLogs } from '../hooks/useIpc'
import type { Provider } from '../constants/providers'
import { providerConfigs } from '../constants/providers'
import { GLM_MODEL_IDS_REQUIRING_SAVE_CONFIRM } from '../constants/glm-config'
import type { OllamaWslSetupGuide } from '@shared/ollama-wsl-setup-guide'

const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/

const providerPatterns: Record<Provider, RegExp> = {
  anthropic: /^sk-ant-/,
  google: /^AIza/,
  openai: /^sk-(?!ant-)/,
  minimax: /^sk-/,
  glm: /^.{8,}$/,
  deepseek: /^sk-/,
  ollama: /^$/
}

interface Props {
  provider: Provider
  authMethod?: 'api-key' | 'oauth'
  modelId?: string
  enableNemoShield: boolean
  selectedSkills: string[]
  /** Bundled / local skills from Additional skills step */
  bundledSkillSelections: { id: string; credentials: Record<string, string> }[]
  telegramToken: string
  zaloBotToken: string
  zaloOaId: string
  zaloOaSecret: string
  larkAppId: string
  larkAppSecret: string
  /** Provider API key (not shown again — collected on Model & Provider step) */
  providerApiKey: string
  oauthCompleted: boolean
  isWindows: boolean
  onDone: (botUsername?: string) => void
}

export default function ConfigStep({
  provider,
  authMethod,
  modelId,
  enableNemoShield,
  selectedSkills,
  bundledSkillSelections,
  telegramToken,
  zaloBotToken,
  zaloOaId,
  zaloOaSecret,
  larkAppId,
  larkAppSecret,
  providerApiKey,
  oauthCompleted,
  isWindows,
  onDone
}: Props): React.JSX.Element {
  const { t } = useTranslation(['steps', 'common'])
  const { t: tMgmt } = useTranslation('management')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyDone, setApplyDone] = useState(false)
  const [savedBotUsername, setSavedBotUsername] = useState<string | undefined>()
  const [logCopied, setLogCopied] = useState(false)
  const [cfgLogTab, setCfgLogTab] = useState<LogTabId>('openclaw')
  const [emailBundledStatus, setEmailBundledStatus] = useState<{
    skillInstalled: boolean
    envExists: boolean
  } | null>(null)
  const [emailTestTo, setEmailTestTo] = useState('')
  const [emailTestBusy, setEmailTestBusy] = useState(false)
  const [emailTestMsg, setEmailTestMsg] = useState<string | null>(null)
  const [emailTestHint, setEmailTestHint] = useState<'gmail_app_password' | null>(null)
  const [emailCredsApplyBusy, setEmailCredsApplyBusy] = useState(false)
  const [emailCredsApplyError, setEmailCredsApplyError] = useState<string | null>(null)
  /** Confirmed from disk after successful save (`settings.json`). */
  const [nemoOnDisk, setNemoOnDisk] = useState<boolean | null>(null)
  /** In-app Ollama setup steps (Windows WSL) from the last save — no log parsing. */
  const [ollamaWslGuide, setOllamaWslGuide] = useState<OllamaWslSetupGuide | null>(null)
  /** Structured lines returned from main when Save fails on Ollama (same as progress log, for clarity). */
  const [ollamaSaveReportLines, setOllamaSaveReportLines] = useState<string[]>([])
  const [glmSaveModalOpen, setGlmSaveModalOpen] = useState(false)
  /** True when GLM 4.7× apply failed once and a second onboard with zai/glm-5 succeeded. */
  const [glmAppliedGlm5Fallback, setGlmAppliedGlm5Fallback] = useState(false)
  const { logs, clearLogs } = useInstallLogs()
  const configSoundPlayedRef = useRef(false)
  const ollamaGuideAnchorRef = useRef<HTMLDivElement>(null)
  /** Re-check OS here so Ollama WSL UI is not gated on a stale `isWindows` from parent. */
  const [envOs, setEnvOs] = useState<'macos' | 'windows' | 'linux' | null>(null)

  const { openclaw: cfgOpenclawLogs, channels: cfgChannelLogs } = useMemo(
    () => splitLogLines(logs),
    [logs]
  )

  const isOAuth = authMethod === 'oauth'
  const isOllama = provider === 'ollama'
  const uaLooksWindows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
  const onWindowsForOllama =
    isWindows || envOs === 'windows' || (envOs === null && uaLooksWindows)
  const pc = providerConfigs.find((p) => p.id === provider)
  const modelLabel = pc?.models.find((m) => m.id === modelId)?.name ?? modelId ?? '—'

  const wantsTelegram = BOT_TOKEN_PATTERN.test(telegramToken)
  const wantsZaloBot = zaloBotToken.trim().length > 0
  const wantsZaloOaPair =
    ZALO_OA_ENABLED && zaloOaId.trim().length > 0 && zaloOaSecret.trim().length > 0
  const oaPartial =
    ZALO_OA_ENABLED &&
    (zaloOaId.length > 0 || zaloOaSecret.length > 0) &&
    !wantsZaloOaPair &&
    !wantsZaloBot
  const zaloModeConflict = ZALO_OA_ENABLED && wantsZaloBot && wantsZaloOaPair
  const zaloBotVsOaFields =
    ZALO_OA_ENABLED && wantsZaloBot && (zaloOaId.length > 0 || zaloOaSecret.length > 0)
  const zaloInvalid = oaPartial || zaloModeConflict || zaloBotVsOaFields

  const wantsZalo = wantsZaloBot || wantsZaloOaPair
  const wantsLark = larkAppId.trim().length > 0 && larkAppSecret.trim().length > 0

  const telegramInvalid = telegramToken.length > 0 && !wantsTelegram
  const larkInvalid = (larkAppId.length > 0 || larkAppSecret.length > 0) && !wantsLark

  const chatOk = !telegramInvalid && !zaloInvalid && !larkInvalid

  const pat = providerPatterns[provider]
  const providerOk = isOAuth ? oauthCompleted : isOllama ? true : pat.test(providerApiKey)

  const emailSelection = useMemo(
    () => bundledSkillSelections.find((s) => s.id === BUNDLED_EMAIL_SKILL_ID),
    [bundledSkillSelections]
  )
  const hasEmailBundled = !!emailSelection
  const emailCreds = emailSelection?.credentials ?? {}
  const emailOk =
    !hasEmailBundled ||
    (Boolean(emailCreds.email?.trim()) && Boolean(emailCreds.password?.trim()))

  const canSave = providerOk && chatOk && emailOk && !saving && !applyDone

  useEffect(() => {
    if (!applyDone || !wantsZalo || zaloInvalid) return
    void window.electronAPI.gateway.ensureReady()
  }, [applyDone, wantsZalo, zaloInvalid])

  useEffect(() => {
    if (applyDone && !configSoundPlayedRef.current) {
      configSoundPlayedRef.current = true
      playConfigSavedChime()
    }
  }, [applyDone])

  useEffect(() => {
    void window.electronAPI.env.check().then((e) => setEnvOs(e.os))
  }, [])

  useEffect(() => {
    if (!isOllama) setOllamaWslGuide(null)
  }, [isOllama])

  useEffect(() => {
    if (ollamaWslGuide) {
      ollamaGuideAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [ollamaWslGuide])

  useEffect(() => {
    if (!applyDone) {
      setNemoOnDisk(null)
      return
    }
    void window.electronAPI.security.status().then((s) => setNemoOnDisk(s.nemoShieldEnabled))
  }, [applyDone])

  useEffect(() => {
    if (!applyDone || !hasEmailBundled || !isWindows) {
      setEmailBundledStatus(null)
      return
    }
    let cancelled = false
    void (async () => {
      await window.electronAPI.emailBundled.ensureAutomation()
      if (cancelled) return
      const st = await window.electronAPI.emailBundled.status()
      if (!cancelled) setEmailBundledStatus(st)
    })()
    return () => {
      cancelled = true
    }
  }, [applyDone, hasEmailBundled, isWindows])

  const refreshEmailBundledStatus = async (): Promise<void> => {
    if (!isWindows || !hasEmailBundled) return
    await window.electronAPI.emailBundled.ensureAutomation()
    const st = await window.electronAPI.emailBundled.status()
    setEmailBundledStatus(st)
  }

  const handleApplyEmailCredentials = async (): Promise<void> => {
    const email = emailCreds.email?.trim() ?? ''
    const password = emailCreds.password?.trim() ?? ''
    if (!email || !password) return
    setEmailCredsApplyBusy(true)
    setEmailCredsApplyError(null)
    setEmailTestMsg(null)
    setEmailTestHint(null)
    try {
      const r = await window.electronAPI.emailBundled.applyCredentials({ email, password })
      if (!r.ok) {
        setEmailCredsApplyError(r.error ?? t('config.emailApplyCredsFailed'))
        return
      }
      if (isWindows) await refreshEmailBundledStatus()
    } catch (e) {
      setEmailCredsApplyError(e instanceof Error ? e.message : t('config.emailApplyCredsFailed'))
    } finally {
      setEmailCredsApplyBusy(false)
    }
  }

  const handleEmailTestSend = async (): Promise<void> => {
    const to = emailTestTo.trim()
    if (!to) return
    setEmailTestBusy(true)
    setEmailTestMsg(null)
    setEmailTestHint(null)
    try {
      const r = await window.electronAPI.emailBundled.sendTest(to)
      if (r.ok) {
        setEmailTestMsg(tMgmt('done.emailTestOk'))
        setEmailTestHint(null)
      } else {
        const err = r.error ?? ''
        setEmailTestMsg(tMgmt('done.emailTestFail', { error: err }))
        setEmailTestHint(smtpErrorUserHint(err))
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setEmailTestMsg(tMgmt('done.emailTestFail', { error: err }))
      setEmailTestHint(smtpErrorUserHint(err))
    } finally {
      setEmailTestBusy(false)
    }
  }

  const copyLogs = async (): Promise<void> => {
    const lines = cfgLogTab === 'openclaw' ? cfgOpenclawLogs : cfgChannelLogs
    if (lines.length === 0) return
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setLogCopied(true)
      window.setTimeout(() => setLogCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const runOnboard = async (mid: string | undefined): Promise<void> => {
    setSaving(true)
    setError(null)
    setOllamaWslGuide(null)
    setOllamaSaveReportLines([])
    setGlmAppliedGlm5Fallback(false)
    clearLogs()
    const payload = {
      provider,
      ...(isOAuth || isOllama ? {} : { apiKey: providerApiKey }),
      authMethod: authMethod ?? 'api-key',
      ...(wantsTelegram ? { telegramBotToken: telegramToken } : {}),
      ...(wantsZaloBot ? { zaloBotToken: zaloBotToken.trim() } : {}),
      ...(wantsZaloOaPair ? { zaloOaId: zaloOaId.trim(), zaloOaSecret: zaloOaSecret.trim() } : {}),
      ...(wantsLark ? { larkAppId: larkAppId.trim(), larkAppSecret: larkAppSecret.trim() } : {}),
      modelId: mid,
      enableNemoShield,
      ...(selectedSkills.length > 0 ? { selectedSkills } : {}),
      ...(bundledSkillSelections.length > 0 ? { bundledSkillSelections } : {})
    }
    try {
      let result = await window.electronAPI.onboard.run(payload)
      if (
        !result.success &&
        provider === 'glm' &&
        mid &&
        GLM_MODEL_IDS_REQUIRING_SAVE_CONFIRM.has(mid)
      ) {
        const retry = await window.electronAPI.onboard.run({ ...payload, modelId: 'zai/glm-5' })
        if (retry.success) {
          if (retry.ollamaWslSetupGuide) setOllamaWslGuide(retry.ollamaWslSetupGuide)
          setSavedBotUsername(retry.botUsername)
          setApplyDone(true)
          setOllamaSaveReportLines([])
          setGlmAppliedGlm5Fallback(true)
          if (
            isWindows &&
            bundledSkillSelections.some(
              (s) =>
                s.id === BUNDLED_GOOGLE_WORKSPACE_SKILL_ID &&
                Boolean(s.credentials?.serviceAccountJson?.trim())
            )
          ) {
            void window.electronAPI.gateway.restart().catch(() => {})
          }
          return
        }
        result = retry
      }
      if (result.ollamaWslSetupGuide) setOllamaWslGuide(result.ollamaWslSetupGuide)
      if (result.success) {
        setSavedBotUsername(result.botUsername)
        setApplyDone(true)
        setOllamaSaveReportLines([])
        if (
          isWindows &&
          bundledSkillSelections.some(
            (s) =>
              s.id === BUNDLED_GOOGLE_WORKSPACE_SKILL_ID &&
              Boolean(s.credentials?.serviceAccountJson?.trim())
          )
        ) {
          void window.electronAPI.gateway.restart().catch(() => {})
        }
      } else {
        setError(result.error ?? t('config.errorOccurred'))
        if (isOllama && (result.ollamaSetupLog?.length ?? 0) > 0) {
          setOllamaSaveReportLines(result.ollamaSetupLog ?? [])
          setCfgLogTab('openclaw')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common:error.unknown'))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveClick = (): void => {
    if (
      provider === 'glm' &&
      modelId &&
      GLM_MODEL_IDS_REQUIRING_SAVE_CONFIRM.has(modelId)
    ) {
      setGlmSaveModalOpen(true)
      return
    }
    void runOnboard(modelId)
  }

  const handleContinue = (): void => {
    onDone(savedBotUsername)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-2">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div>
          <h2 className="text-lg font-extrabold">{t('config.title')}</h2>
          <p className="text-xs text-text-muted">{t('config.desc')}</p>
        </div>

        {isOllama && onWindowsForOllama && !applyDone && <OllamaWindowsPrepCard />}

        {isOllama && ollamaWslGuide && (
          <div ref={ollamaGuideAnchorRef}>
            <OllamaWslIssueGuide guide={ollamaWslGuide} />
          </div>
        )}

        <div className="glass-card space-y-2 rounded-xl p-3 text-xs">
          <p className="font-bold text-primary">{t('config.summaryProvider')}</p>
          <p>
            <span className="text-text-muted">{t('config.summaryModel')}:</span>{' '}
            {glmAppliedGlm5Fallback ? t('config.glmFallbackAppliedNote') : modelLabel}
          </p>
          <p>
            <span className="text-text-muted">Provider:</span> {provider}
            {isOAuth && ' · OAuth'}
          </p>
        </div>

        <div className="glass-card space-y-1.5 rounded-xl p-3 text-xs">
          <p className="font-bold text-primary">{t('config.nemoShieldSummaryTitle')}</p>
          {!applyDone ? (
            <p
              className={`text-[11px] leading-snug ${enableNemoShield ? 'font-semibold text-[var(--color-success)]' : 'text-text-muted'}`}
            >
              {enableNemoShield ? t('config.nemoShieldBeforeSaveOn') : t('config.nemoShieldBeforeSaveOff')}
            </p>
          ) : (
            <p
              className={`text-[11px] leading-snug ${nemoOnDisk ? 'font-semibold text-[var(--color-success)]' : 'text-text-muted'}`}
            >
              {nemoOnDisk === null
                ? enableNemoShield
                  ? t('config.nemoShieldBeforeSaveOn')
                  : t('config.nemoShieldBeforeSaveOff')
                : nemoOnDisk
                  ? t('config.nemoShieldAfterSaveOn')
                  : t('config.nemoShieldAfterSaveOff')}
            </p>
          )}
        </div>

        <div className="glass-card space-y-2 rounded-xl p-3 text-xs">
          <p className="font-bold text-primary">{t('config.summaryChat')}</p>
          <ul className="list-inside list-disc space-y-0.5 text-text-muted">
            {wantsTelegram && <li>Telegram</li>}
            {wantsZaloBot && <li>{t('config.summaryZaloBot')}</li>}
            {wantsZaloOaPair && !wantsZaloBot && <li>{t('config.summaryZaloOa')}</li>}
            {wantsLark && <li>Lark / Feishu</li>}
            {!wantsTelegram && !wantsZalo && !wantsLark && <li>{t('config.summaryChatNone')}</li>}
          </ul>
        </div>

        {(selectedSkills.length > 0 || bundledSkillSelections.length > 0) && (
          <div className="glass-card space-y-1 rounded-xl p-3 text-xs">
            <p className="font-bold text-primary">{t('config.summaryExtras')}</p>
            {selectedSkills.length > 0 && (
              <p>
                <span className="text-text-muted">{t('config.summarySkills')}:</span>{' '}
                {selectedSkills.join(', ')}
              </p>
            )}
            {bundledSkillSelections.length > 0 && (
              <p>
                <span className="text-text-muted">{t('config.summaryBundledSkills')}:</span>{' '}
                {bundledSkillSelections.map((s) => s.id).join(', ')}
              </p>
            )}
          </div>
        )}

        {hasEmailBundled && applyDone && (
          <div className="glass-card space-y-3 rounded-xl border border-primary/25 p-3 text-xs">
            <p className="font-bold text-primary">{t('config.emailBundledSection')}</p>
            <div className="border-glass-border space-y-2 border-t border-dashed border-primary/20 pt-3">
              <p className="text-text-muted text-[10px] leading-snug">{t('config.emailApplyCredsHint')}</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={
                  emailCredsApplyBusy ||
                  !emailCreds.email?.trim() ||
                  !emailCreds.password?.trim()
                }
                loading={emailCredsApplyBusy}
                onClick={() => void handleApplyEmailCredentials()}
              >
                {t('config.emailApplyCredsBtn')}
              </Button>
              {emailCredsApplyError && (
                <p className="text-[10px] font-medium text-error">{emailCredsApplyError}</p>
              )}
            </div>
          </div>
        )}

        {zaloInvalid && (
          <p className="text-xs font-medium text-error">
            {zaloModeConflict || zaloBotVsOaFields
              ? t('config.zaloModeConflict')
              : t('config.zaloOaIncomplete')}
          </p>
        )}

        {!zaloInvalid && wantsZalo && (
          <div className="space-y-2">
            {!applyDone && (
              <p className="text-[10px] leading-snug text-text-muted/90">{t('config.zaloPairingSaveFirst')}</p>
            )}
            <ZaloPairingPanel
              titleOverride={t('config.zaloAuthTitle')}
              disabled={!applyDone}
              autoRefreshOnMount={applyDone}
              pollIntervalMs={applyDone ? 8000 : 0}
            />
          </div>
        )}

        {logs.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-text-muted">{t('hooks.logTitle')}</span>
              <button
                type="button"
                onClick={() => void copyLogs()}
                className="text-[11px] font-bold text-primary hover:underline"
                title={tMgmt('logViewer.copyActiveTabHint')}
              >
                {logCopied ? t('hooks.logCopied') : t('hooks.logCopy')}
              </button>
            </div>
            <LogViewerTabs
              openclawLines={cfgOpenclawLogs}
              channelLines={cfgChannelLogs}
              activeTab={cfgLogTab}
              onTabChange={setCfgLogTab}
            />
          </div>
        )}

        {applyDone && hasEmailBundled && (
          <div className="glass-card space-y-2 rounded-xl border border-primary/25 border-dashed p-3 text-xs">
            <p className="text-[11px] font-bold text-primary">{t('config.emailTestRecipientTitle')}</p>
            <p className="text-text-muted text-[10px] leading-snug">{t('config.emailTestRecipientSubtitle')}</p>
            {!isWindows && (
              <p className="text-[10px] leading-snug text-text-muted">{t('config.emailTestWindowsOnly')}</p>
            )}
            {isWindows && emailBundledStatus === null && (
              <p className="text-[10px] text-text-muted">{t('config.emailTestPreparing')}</p>
            )}
            {isWindows && emailBundledStatus?.skillInstalled && (
              <>
                <p className="text-text-muted text-[10px] leading-snug">
                  {emailBundledStatus.envExists
                    ? tMgmt('done.emailBundledReady')
                    : tMgmt('done.emailBundledNeedEnv')}
                </p>
                {emailBundledStatus.envExists && (
                  <>
                    <input
                      type="email"
                      value={emailTestTo}
                      onChange={(e) => {
                        setEmailTestTo(e.target.value)
                        setEmailTestMsg(null)
                        setEmailTestHint(null)
                      }}
                      placeholder={tMgmt('done.emailTestPlaceholder')}
                      className="border-glass-border w-full rounded-lg border bg-white/5 px-2 py-1.5 text-[11px] text-text focus:border-primary/60 focus:outline-none"
                      autoComplete="email"
                    />
                    <button
                      type="button"
                      disabled={emailTestBusy || !emailTestTo.trim()}
                      onClick={() => void handleEmailTestSend()}
                      className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40"
                    >
                      {emailTestBusy ? tMgmt('done.emailTestSending') : tMgmt('done.emailTestSend')}
                    </button>
                    {emailTestHint === 'gmail_app_password' && (
                      <div className="space-y-2">
                        <p className="text-warning/90 text-[10px] leading-snug">
                          {tMgmt('done.emailTestGmailAppPassword')}
                        </p>
                        <GmailAppPasswordLinks />
                      </div>
                    )}
                    {emailTestMsg && (
                      <p className="text-[10px] leading-snug text-text-muted/90">{emailTestMsg}</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {error && isOllama && (ollamaSaveReportLines.length > 0 || cfgOpenclawLogs.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-text-muted">{t('config.ollamaTechnicalReportTitle')}</p>
            <p className="text-[10px] leading-snug text-text-muted">{t('config.ollamaTechnicalReportFoot')}</p>
            <LogViewer
              lines={
                ollamaSaveReportLines.length > 0 ? ollamaSaveReportLines : cfgOpenclawLogs
              }
            />
          </div>
        )}
        {error && <p className="text-xs font-medium text-error">{error}</p>}
        {applyDone && (
          <p className="text-xs font-semibold text-[var(--color-success)]">{t('config.applyDoneHint')}</p>
        )}

      </div>

      {glmSaveModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="glm-save-confirm-title"
        >
          <div className="glass-card max-w-md space-y-3 rounded-xl border border-glass-border p-4 shadow-xl">
            <h3 id="glm-save-confirm-title" className="text-sm font-extrabold text-text">
              {t('config.glmSaveConfirmTitle')}
            </h3>
            <p className="text-[11px] leading-snug text-text-muted">
              {t('config.glmSaveConfirmBody', {
                modelName: modelLabel,
                estimate: t('config.glmSaveConfirmEstimate')
              })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button variant="secondary" size="sm" onClick={() => setGlmSaveModalOpen(false)}>
                {t('config.glmSaveConfirmCancel')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setGlmSaveModalOpen(false)
                  void runOnboard('zai/glm-5')
                }}
              >
                {t('config.glmSaveConfirmUseGlm5')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setGlmSaveModalOpen(false)
                  void runOnboard(modelId)
                }}
              >
                {t('config.glmSaveConfirmAccept')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-col gap-2 border-t border-glass-border/40 pt-3">
        {!applyDone ? (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={() => void handleSaveClick()} disabled={!canSave} loading={saving}>
              {saving ? t('config.savingBtn') : t('config.saveBtn')}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={handleContinue}>
              {t('config.nextAfterApply')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
