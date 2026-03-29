import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_GIB } from '@shared/wsl-windows-disk'
import Button from '../components/Button'

type WslState =
  | 'not_available'
  | 'not_installed'
  | 'needs_reboot'
  | 'no_distro'
  | 'not_initialized'
  | 'ready'

interface WslSetupStepProps {
  wslState: WslState
  onReady: () => void
}

export default function WslSetupStep({ wslState, onReady }: WslSetupStepProps): React.JSX.Element {
  const { t } = useTranslation('steps')
  const [installing, setInstalling] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagLines, setDiagLines] = useState<string[]>([])
  const [diagCopied, setDiagCopied] = useState(false)
  const [currentState, setCurrentState] = useState<WslState>(wslState)
  const [diskHint, setDiskHint] = useState<{
    supported: boolean
    driveLabel: string
    freeBytes: number | null
    meetsRecommendation: boolean | null
  } | null>(null)

  useEffect(() => {
    setCurrentState(wslState)
  }, [wslState])

  useEffect(() => {
    let cancelled = false
    void window.electronAPI.wsl.systemDriveDiskHint().then((h) => {
      if (cancelled) return
      setDiskHint({
        supported: h.supported,
        driveLabel: h.driveLabel,
        freeBytes: h.freeBytes,
        meetsRecommendation: h.meetsRecommendation
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-advance to next step when ready
  useEffect(() => {
    if (currentState !== 'ready') return
    const timer = setTimeout(onReady, 500)
    return () => clearTimeout(timer)
  }, [currentState, onReady])

  const handleInstallWsl = async (): Promise<void> => {
    setInstalling(true)
    setError(null)
    try {
      const result = await window.electronAPI.wsl.install(currentState)
      if (result.success && result.needsReboot) {
        setCurrentState(result.state ?? 'needs_reboot')
        // Save state before reboot
        await window.electronAPI.wizard.saveState({
          step: 'wslSetup',
          wslInstalled: true,
          timestamp: Date.now()
        })
      } else if (!result.success) {
        setError(result.error ?? t('wslSetup.wslFailed'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('wslSetup.wslError'))
    } finally {
      setInstalling(false)
    }
  }

  const handleInstallDistro = async (): Promise<void> => {
    setInstalling(true)
    setError(null)
    try {
      const result = await window.electronAPI.wsl.install(currentState)
      if (result.success && result.needsReboot) {
        setCurrentState(result.state ?? 'needs_reboot')
        await window.electronAPI.wizard.saveState({
          step: 'wslSetup',
          wslInstalled: true,
          timestamp: Date.now()
        })
      } else if (result.success) {
        setCurrentState(result.state ?? currentState)
      } else {
        setError(result.error ?? t('wslSetup.ubuntuFailed'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('wslSetup.ubuntuError'))
    } finally {
      setInstalling(false)
    }
  }

  const handleReboot = (): void => {
    window.electronAPI.reboot()
  }

  const handleOpenFeatures = async (): Promise<void> => {
    await window.electronAPI.wsl.openFeatures()
  }

  const handleOpenStoreUbuntu = async (): Promise<void> => {
    await window.electronAPI.wsl.openStoreUbuntu()
  }

  const handleOpenWindowsUpdate = async (): Promise<void> => {
    await window.electronAPI.wsl.openWindowsUpdate()
  }

  const handleDiagnose = async (): Promise<void> => {
    setDiagnosing(true)
    try {
      const r = await window.electronAPI.wsl.diagnose()
      setDiagLines(r.lines ?? [])
    } finally {
      setDiagnosing(false)
    }
  }

  const handleCopyDiag = async (): Promise<void> => {
    if (diagLines.length === 0) return
    try {
      await navigator.clipboard.writeText(diagLines.join('\n'))
      setDiagCopied(true)
      window.setTimeout(() => setDiagCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  const showDiskHint =
    diskHint?.supported === true &&
    currentState !== 'ready' &&
    currentState !== 'not_available'
  const freeGiB =
    diskHint?.freeBytes == null
      ? null
      : Math.round((diskHint.freeBytes / (1024 * 1024 * 1024)) * 10) / 10
  const diskHintWarn = showDiskHint && diskHint?.meetsRecommendation === false

  return (
    <div className="flex flex-1 flex-col items-center gap-5 px-8 pb-4 pt-2">
      <h2 className="text-lg font-extrabold">{t('wslSetup.title')}</h2>

      {showDiskHint && (
        <div
          className={`glass-card w-full max-w-md space-y-2 rounded-xl px-4 py-3 text-left text-xs leading-relaxed ${
            diskHintWarn
              ? 'border border-[color-mix(in_oklab,var(--color-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_8%,transparent)]'
              : ''
          }`}
        >
          <p className="text-[11px] font-extrabold text-primary">{t('wslSetup.diskHintTitle')}</p>
          <p className="text-text-muted text-[11px] leading-snug">
            {t('wslSetup.diskHintBody', {
              drive: diskHint?.driveLabel ?? '',
              recommendedGiB: WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_GIB
            })}
          </p>
          {freeGiB == null ? (
            <p className="text-text-muted text-[11px]">
              {t('wslSetup.diskHintFreeUnknown', { drive: diskHint?.driveLabel ?? '' })}
            </p>
          ) : (
            <p className="text-text-muted text-[11px] font-medium">
              {t('wslSetup.diskHintFreeRow', {
                freeGiB,
                drive: diskHint?.driveLabel ?? ''
              })}
            </p>
          )}
          {diskHintWarn && (
            <p className="text-warning/90 text-[11px] font-semibold leading-snug">
              {t('wslSetup.diskHintLow', {
                drive: diskHint?.driveLabel ?? '',
                recommendedGiB: WSL_SYSTEM_DRIVE_RECOMMENDED_FREE_GIB
              })}
            </p>
          )}
        </div>
      )}

      {currentState === 'not_available' && (
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-text-muted text-sm">{t('wslSetup.notAvailable')}</p>
          <p className="text-text-muted text-xs">{t('wslSetup.checkVersion')}</p>
        </div>
      )}

      {currentState === 'not_installed' && (
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-text-muted text-sm">{t('wslSetup.wslRequired')}</p>
          <p className="text-text-muted text-xs">{t('wslSetup.autoInstall')}</p>
          <Button variant="primary" size="lg" onClick={handleInstallWsl} loading={installing}>
            {installing ? t('wslSetup.wslInstalling') : t('wslSetup.wslInstall')}
          </Button>
        </div>
      )}

      {currentState === 'needs_reboot' && (
        <div className="text-center space-y-3 max-w-sm">
          <div className="glass-card px-5 py-4 space-y-2">
            <p className="text-sm font-semibold text-primary">{t('wslSetup.rebootRequired')}</p>
            <p className="text-text-muted text-xs leading-relaxed">{t('wslSetup.rebootDesc')}</p>
          </div>
          <Button variant="primary" size="lg" onClick={handleReboot}>
            {t('wslSetup.rebootNow')}
          </Button>
        </div>
      )}

      {currentState === 'no_distro' && (
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-text-muted text-sm">{t('wslSetup.ubuntuInstallDesc')}</p>
          <Button variant="primary" size="lg" onClick={handleInstallDistro} loading={installing}>
            {installing ? t('wslSetup.ubuntuInstalling') : t('wslSetup.ubuntuInstall')}
          </Button>
        </div>
      )}

      {currentState === 'not_initialized' && (
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-text-muted text-sm">{t('wslSetup.ubuntuInitDesc')}</p>
          <Button variant="primary" size="lg" onClick={handleInstallDistro} loading={installing}>
            {installing ? t('wslSetup.ubuntuIniting') : t('wslSetup.ubuntuInit')}
          </Button>
        </div>
      )}

      {currentState === 'ready' && (
        <p className="text-text-muted text-sm animate-pulse">{t('wslSetup.wslReady')}</p>
      )}

      {error && (
        <div className="glass-card px-4 py-3 max-w-sm">
          <p className="text-error text-xs">{error}</p>
        </div>
      )}

      {(currentState === 'not_installed' ||
        currentState === 'no_distro' ||
        currentState === 'not_initialized' ||
        error) && (
        <div className="w-full max-w-md space-y-2">
          <p className="text-center text-[11px] font-semibold text-text-muted">
            {t('wslSetup.helpTitle')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="secondary" size="sm" onClick={() => void handleOpenFeatures()}>
              {t('wslSetup.openFeaturesBtn')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleOpenStoreUbuntu()}>
              {t('wslSetup.openStoreUbuntuBtn')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleOpenWindowsUpdate()}>
              {t('wslSetup.openWindowsUpdateBtn')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleDiagnose()}
              loading={diagnosing}
            >
              {t('wslSetup.runDiagnoseBtn')}
            </Button>
          </div>
          {diagLines.length > 0 && (
            <div className="glass-card space-y-2 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold text-text-muted">{t('wslSetup.diagnoseTitle')}</p>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-primary hover:underline"
                  onClick={() => void handleCopyDiag()}
                >
                  {diagCopied ? t('wslSetup.diagnoseCopied') : t('wslSetup.copyDiagnoseBtn')}
                </button>
              </div>
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/35 p-2 text-[10px] leading-snug text-white/80">
                {diagLines.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
