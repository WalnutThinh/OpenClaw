import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import Button from '../components/Button'
import LogViewerTabs, { type LogTabId } from '../components/LogViewerTabs'
import { appendCapped, classifyGatewayLogLine } from '../utils/gateway-log-split'
import ManagementModal from '../components/ManagementModal'
import ProviderSwitchModal from '../components/ProviderSwitchModal'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useManagement } from '../hooks/useManagement'
import { LARK_OPEN_URL, ZALO_OPEN_URL } from '../constants/openclaw'
import ZaloPairingPanel from '../components/ZaloPairingPanel'

type ChatChannel = 'telegram' | 'zalo' | 'lark'

function buildChatChannels(cfg: {
  hasTelegram?: boolean
  hasZalo?: boolean
  hasLark?: boolean
}): ChatChannel[] {
  const list: ChatChannel[] = []
  /** Zalo first for regional UX; then Telegram, Lark (matches “use what you configured”). */
  if (cfg.hasZalo) list.push('zalo')
  if (cfg.hasTelegram) list.push('telegram')
  if (cfg.hasLark) list.push('lark')
  return list
}

function openChatChannel(ch: ChatChannel, botUsername?: string): void {
  if (ch === 'telegram') {
    const url = botUsername ? `tg://resolve?domain=${botUsername}` : 'tg://'
    window.open(url, '_blank')
    return
  }
  if (ch === 'zalo') {
    window.open(ZALO_OPEN_URL, '_blank')
    return
  }
  window.open(LARK_OPEN_URL, '_blank')
}

const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000 // 30 min

export default function DoneStep({
  botUsername,
  onTroubleshoot,
  onUninstallDone
}: {
  botUsername?: string
  onTroubleshoot?: () => void
  onUninstallDone?: () => void
}): React.JSX.Element {
  const { t } = useTranslation('management')
  const [status, setStatus] = useState<'starting' | 'running' | 'stopped'>('starting')
  const [hasError, setHasError] = useState(false)
  const [openclawLogs, setOpenclawLogs] = useState<string[]>([])
  const [channelLogs, setChannelLogs] = useState<string[]>([])
  const [activeLogTab, setActiveLogTab] = useState<LogTabId>('openclaw')
  const [gwLogCopied, setGwLogCopied] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [currentProvider, setCurrentProvider] = useState<string | undefined>()
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([])
  const [nemoShieldOn, setNemoShieldOn] = useState(false)
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [hostOs, setHostOs] = useState<'macos' | 'windows' | 'linux'>('windows')

  // OpenClaw update state
  const [openclawUpdate, setOpenclawUpdate] = useState<{
    current: string
    latest: string
  } | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateLogs, setUpdateLogs] = useState<string[]>([])
  const updateCheckedRef = useRef(false)

  const tRef = useRef<TFunction>(t)
  tRef.current = t

  const { uninstall, backup } = useManagement(setStatus)

  const copyGatewayLogs = async (): Promise<void> => {
    const lines = activeLogTab === 'openclaw' ? openclawLogs : channelLogs
    if (lines.length === 0) return
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setGwLogCopied(true)
      window.setTimeout(() => setGwLogCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  // Check for OpenClaw updates
  const checkOpenclawUpdate = useCallback(async () => {
    try {
      const info = await window.electronAPI.openclaw.checkUpdate()
      if (info.currentVersion && info.latestVersion && info.currentVersion !== info.latestVersion) {
        setOpenclawUpdate({ current: info.currentVersion, latest: info.latestVersion })
      } else {
        setOpenclawUpdate(null)
      }
    } catch {
      /* ignore network errors */
    }
  }, [])

  // Check once when Gateway is running + every 30 min
  useEffect(() => {
    if (status !== 'running') return

    if (!updateCheckedRef.current) {
      updateCheckedRef.current = true
      checkOpenclawUpdate()
    }

    const timer = setInterval(checkOpenclawUpdate, UPDATE_CHECK_INTERVAL)
    return () => clearInterval(timer)
  }, [status, checkOpenclawUpdate])

  // Execute OpenClaw update
  const handleOpenclawUpdate = useCallback(async () => {
    setUpdating(true)
    setUpdateLogs([])

    const unsubProgress = window.electronAPI.install.onProgress((msg) => {
      setUpdateLogs((prev) => [...prev, msg])
    })
    const unsubError = window.electronAPI.install.onError((msg) => {
      setUpdateLogs((prev) => [...prev, tRef.current('done.errorPrefix', { msg })])
    })

    try {
      const result = await window.electronAPI.install.openclaw()
      if (result.success) {
        setUpdateLogs((prev) => [...prev, tRef.current('done.restartingGw')])
        await window.electronAPI.gateway.restart()
        setStatus('running')
        await checkOpenclawUpdate()
      }
    } finally {
      unsubProgress()
      unsubError()
      setUpdating(false)
    }
  }, [checkOpenclawUpdate])

  // Load auto launch settings
  useEffect(() => {
    window.electronAPI.autoLaunch.get().then((r) => setAutoLaunch(r.enabled))
  }, [])

  useEffect(() => {
    void window.electronAPI.env.check().then((e) => setHostOs(e.os))
  }, [])

  // Read current provider/model
  const loadCurrentConfig = useCallback(() => {
    window.electronAPI.config.read().then((r) => {
      if (r.success && r.config) {
        setCurrentModel(r.config.model || null)
        setCurrentProvider(r.config.provider)
        setChatChannels(buildChatChannels(r.config))
      }
    })
    void window.electronAPI.security.status().then((s) => setNemoShieldOn(s.nemoShieldEnabled))
  }, [])

  useEffect(() => {
    loadCurrentConfig()
  }, [loadCurrentConfig])

  const toggleAutoLaunch = async (): Promise<void> => {
    const next = !autoLaunch
    await window.electronAPI.autoLaunch.set(next)
    setAutoLaunch(next)
  }

  useEffect(() => {
    const unsub = window.electronAPI.gateway.onLog((msg) => {
      if (classifyGatewayLogLine(msg) === 'channel') {
        setChannelLogs((prev) => appendCapped(prev, msg))
      } else {
        setOpenclawLogs((prev) => appendCapped(prev, msg))
      }
    })
    return unsub
  }, [])

  // Subscribe to Gateway status changes from tray
  useEffect(() => {
    const unsub = window.electronAPI.gateway.onStatusChanged((s) => {
      setStatus(s === 'running' ? 'running' : 'stopped')
    })
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false

    const bootstrapGateway = async (): Promise<void> => {
      const s0 = await window.electronAPI.gateway.status()
      if (cancelled) return
      if (s0 === 'running') {
        setStatus('running')
        return
      }
      const er = await window.electronAPI.gateway.ensureReady()
      if (cancelled) return
      if (er.ok) {
        setStatus('running')
        return
      }
      setStatus('stopped')
      setHasError(true)
      if (er.error) {
        setOpenclawLogs((prev) => appendCapped(prev, tRef.current('done.errorPrefix', { msg: er.error })))
      }
    }

    void bootstrapGateway()

    return () => {
      cancelled = true
    }
  }, [])

  const handleStop = async (): Promise<void> => {
    await window.electronAPI.gateway.stop()
    setStatus('stopped')
  }

  const handleStart = async (): Promise<void> => {
    setStatus('starting')
    setOpenclawLogs([])
    setChannelLogs([])
    setHasError(false)
    const r = await window.electronAPI.gateway.start()
    setStatus(r.success ? 'running' : 'stopped')
    if (!r.success) {
      setHasError(true)
      if (r.error) {
        setOpenclawLogs((prev) => appendCapped(prev, tRef.current('done.errorPrefix', { msg: r.error })))
      }
    }
  }

  const handleOpenDashboard = useCallback(async (): Promise<void> => {
    const r = await window.electronAPI.dashboard.open()
    if (!r.ok) {
      setOpenclawLogs((prev) => appendCapped(prev, t('done.dashboardGatewayStopped')))
    }
  }, [t])

  const handleRestart = useCallback(async (): Promise<void> => {
    setStatus('starting')
    setOpenclawLogs([])
    setChannelLogs([])
    setHasError(false)
    const r = await window.electronAPI.gateway.restart()
    setStatus(r.success ? 'running' : 'stopped')
    if (!r.success) {
      setHasError(true)
      if (r.error) {
        setOpenclawLogs((prev) => appendCapped(prev, tRef.current('done.errorPrefix', { msg: r.error })))
      }
    }
  }, [])

  const primaryChat = chatChannels[0]

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-6 sm:px-8">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      {/* Gateway status (brand is in StepIndicator header) */}
      <div className="flex shrink-0 flex-col items-center gap-1 pt-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full transition-colors duration-500 ${
              status === 'running'
                ? 'bg-success'
                : status === 'starting'
                  ? 'bg-warning'
                  : 'bg-text-muted/40'
            }`}
            style={
              status !== 'stopped'
                ? {
                    animation: 'glow-pulse 2s infinite',
                    color: status === 'running' ? 'var(--color-success)' : 'var(--color-warning)'
                  }
                : {}
            }
          />
          <span className="text-sm font-bold tracking-wide">
            {status === 'running'
              ? t('done.gatewayRunning')
              : status === 'starting'
                ? t('done.gatewayStarting')
                : t('done.gatewayStopped')}
          </span>
        </div>
        {currentModel && (
          <button
            type="button"
            onClick={() => setShowProviderModal(true)}
            className="flex cursor-pointer items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <span className="text-[11px] text-text-muted">{t('done.aiModel')}</span>
            <span className="text-[11px] font-bold text-primary">{currentModel}</span>
            <span className="text-[10px] text-text-muted/60">{t('done.changeModel')}</span>
          </button>
        )}
        <p
          className={`max-w-md text-center text-[10px] leading-snug ${nemoShieldOn ? 'font-semibold text-[var(--color-success)]' : 'text-text-muted/80'}`}
        >
          {nemoShieldOn ? t('done.nemoShieldStatusOn') : t('done.nemoShieldStatusOff')}
        </p>
      </div>

      {/* OpenClaw update banner */}
      {(openclawUpdate || updating) && (
        <div className="mx-auto flex w-full max-w-lg shrink-0 items-center gap-3 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/15 via-blue-500/10 to-blue-500/15 px-4 py-2">
          <span className="text-base">{updating ? '⏳' : '🔄'}</span>
          <div className="flex-1 min-w-0">
            {updating ? (
              <div>
                <span className="text-[12px] font-bold">{t('common:status.updating')}</span>
                {updateLogs.length > 0 && (
                  <p className="text-[11px] text-text-muted/70 truncate">
                    {updateLogs[updateLogs.length - 1]}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-[12px] font-bold">
                {t('done.ocUpdateAvailable', { latest: openclawUpdate!.latest })}
                <span className="text-text-muted/50 font-normal ml-1">
                  ({t('done.ocCurrentVersion', { current: openclawUpdate!.current })})
                </span>
              </span>
            )}
          </div>
          {!updating && (
            <button
              onClick={handleOpenclawUpdate}
              className="px-3 py-1 text-[11px] font-bold rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              {t('common:button.update')}
            </button>
          )}
        </div>
      )}

      {/* Primary row: Open Chat, Dashboard, Restart, Stop (when running) */}
      <div className="flex w-full shrink-0 flex-wrap items-center justify-center gap-2 py-2">
        {status === 'running' && (
          <>
            <Button
              variant="primary"
              size="lg"
              disabled={!primaryChat}
              title={!primaryChat ? t('done.openChatNoChannel') : undefined}
              onClick={() => primaryChat && openChatChannel(primaryChat, botUsername)}
            >
              {t('done.openChat')}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void handleOpenDashboard()}>
              {t('done.openDashboard')}
            </Button>
            <Button variant="secondary" size="lg" onClick={handleRestart}>
              {t('done.restartBtn')}
            </Button>
            <Button variant="secondary" size="lg" onClick={handleStop}>
              {t('done.stopBtn')}
            </Button>
          </>
        )}
        {status === 'stopped' && (
          <>
            <Button variant="primary" size="lg" onClick={handleStart}>
              {t('done.startBtn')}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void handleOpenDashboard()}>
              {t('done.openDashboard')}
            </Button>
          </>
        )}
      </div>

      {/* Scrollable: log (left) | utility buttons (right) */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2 pt-2">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,min(100%,320px))] md:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[12px] font-bold text-primary">{t('done.logTitle')}</span>
              {hasError && (
                <span className="text-[10px] text-error">{t('done.errorDetected')}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => void copyGatewayLogs()}
                className="text-[11px] font-bold text-primary hover:underline"
                title={t('logViewer.copyActiveTabHint')}
              >
                {gwLogCopied ? t('done.copied') : t('done.copyLog')}
              </button>
            </div>
            <LogViewerTabs
              openclawLines={openclawLogs}
              channelLines={channelLogs}
              activeTab={activeLogTab}
              onTabChange={setActiveLogTab}
              logPaneClassName="min-h-[11rem] max-h-[min(42vh,22rem)]"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted/60">
              {t('done.toolsTitle')}
            </span>
            {chatChannels.includes('zalo') && (
              <div className="space-y-1">
                <p className="text-[9px] leading-snug text-text-muted/80">{t('done.zaloPairingSectionHint')}</p>
                <ZaloPairingPanel
                  disabled={status !== 'running'}
                  autoRefreshOnMount={status === 'running'}
                  pollIntervalMs={status === 'running' ? 8000 : 0}
                />
              </div>
            )}
            <button
              type="button"
              onClick={toggleAutoLaunch}
              className="glass-card flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-all duration-200 hover:border-primary/40"
            >
              <span className="text-sm">⚙️</span>
              <span className="flex-1 text-left text-[11px] font-bold">{t('done.autoLaunch')}</span>
              <div
                className={`h-4.5 w-8 rounded-full p-0.5 transition-colors duration-200 ${
                  autoLaunch ? 'bg-primary' : 'bg-white/15'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    autoLaunch ? 'translate-x-3.5' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>
            {onTroubleshoot && (
              <button
                type="button"
                onClick={onTroubleshoot}
                className="glass-card flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-all duration-200 hover:border-primary/40"
              >
                <span className="text-sm">🔧</span>
                <span className="flex-1 text-left text-[11px] font-bold">{t('done.troubleshoot')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={backup.execute}
              className="glass-card flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-all duration-200 hover:border-primary/40"
            >
              <span className="text-sm">📦</span>
              <span className="flex-1 text-left text-[11px] font-bold">{t('done.backup')}</span>
            </button>
            <button
              type="button"
              onClick={backup.openRestore}
              className="glass-card flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-all duration-200 hover:border-primary/40"
            >
              <span className="text-sm">📥</span>
              <span className="flex-1 text-left text-[11px] font-bold">{t('done.restore')}</span>
            </button>
            <button
              type="button"
              onClick={uninstall.open}
              className="glass-card flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-all duration-200 hover:border-error/40"
            >
              <span className="text-sm">🗑️</span>
              <span className="flex-1 text-left text-[11px] font-bold text-error/80">{t('done.delete')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Uninstall modal ─── */}
      {uninstall.modal && (
        <ManagementModal
          title={t('uninstall.title')}
          phase={uninstall.modal}
          message={uninstall.progress}
          errorMsg={uninstall.error}
          onClose={() => {
            const wasDone = uninstall.modal === 'done'
            uninstall.close()
            if (wasDone) onUninstallDone?.()
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-text-muted">{t('uninstall.desc')}</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={uninstall.removeConfig}
                onChange={(e) => uninstall.setRemoveConfig(e.target.checked)}
                className="w-4 h-4 rounded border-glass-border accent-primary"
              />
              <span className="text-sm">{t('uninstall.removeConfig')}</span>
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={uninstall.close}>
                {t('common:button.cancel')}
              </Button>
              <button
                onClick={uninstall.execute}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-error/20 text-error border border-error/30 hover:bg-error/30 transition-all duration-200 cursor-pointer"
              >
                {t('common:button.delete')}
              </button>
            </div>
          </div>
        </ManagementModal>
      )}

      {/* ─── Restore modal ─── */}
      {backup.restoreModal && (
        <ManagementModal
          title={t('backupRestore.restoreTitle')}
          phase={backup.restoreModal}
          message={backup.restoreMsg}
          errorMsg={backup.restoreMsg}
          onClose={backup.closeRestore}
        >
          <div className="space-y-3">
            <p className="text-sm text-text-muted">{t('backupRestore.restoreDesc')}</p>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={backup.closeRestore}>
                {t('common:button.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={backup.executeRestore}>
                {t('backupRestore.selectFile')}
              </Button>
            </div>
          </div>
        </ManagementModal>
      )}

      {/* ─── Backup modal ─── */}
      {backup.backupModal && backup.backupModal !== 'confirm' && (
        <ManagementModal
          title={t('done.settingsBackup')}
          phase={backup.backupModal}
          message={backup.backupMsg}
          errorMsg={backup.backupMsg}
          onClose={backup.closeBackup}
        />
      )}

      {/* ─── Provider switch modal ─── */}
      {showProviderModal && (
        <ProviderSwitchModal
          currentProvider={currentProvider}
          currentModel={currentModel || undefined}
          hostOs={hostOs}
          onClose={() => setShowProviderModal(false)}
          onSuccess={() => {
            loadCurrentConfig()
            // Gateway restart is handled by IPC handler (config:switch-provider)
            setStatus('starting')
            setTimeout(async () => {
              const s = await window.electronAPI.gateway.status()
              setStatus(s === 'running' ? 'running' : 'stopped')
            }, 3000)
          }}
        />
      )}
    </div>
  )
}
