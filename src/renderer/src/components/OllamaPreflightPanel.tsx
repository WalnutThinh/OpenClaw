import { useTranslation } from 'react-i18next'
import type { OllamaPreflight } from '@shared/ollama-preflight'
import {
  OLLAMA_RECOMMENDED_MIN_FREE_DISK_BYTES,
  OLLAMA_RECOMMENDED_MIN_RAM_BYTES
} from '@shared/ollama-preflight'

type OsKind = 'macos' | 'windows' | 'linux'

function toGiBOneDecimal(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(1)
}

function wslStateToEnvCheckKey(state: string): string {
  const map: Record<string, string> = {
    ready: 'ready',
    no_distro: 'noDistro',
    needs_reboot: 'needsReboot',
    not_installed: 'notInstalled',
    not_initialized: 'notInitialized',
    not_available: 'notAvailable'
  }
  return map[state] ?? 'checking'
}

interface Props {
  os: OsKind
  preflight: OllamaPreflight | null | undefined
  wslState?: string
  loading?: boolean
  /** env:check failed — show requirements without live numbers */
  loadFailed?: boolean
  compact?: boolean
}

export default function OllamaPreflightPanel({
  os,
  preflight,
  wslState,
  loading = false,
  loadFailed = false,
  compact = false
}: Props): React.JSX.Element {
  const { t } = useTranslation('steps')
  const ramMinGib = String(Math.round(OLLAMA_RECOMMENDED_MIN_RAM_BYTES / (1024 ** 3)))
  const diskMinGib = String(Math.round(OLLAMA_RECOMMENDED_MIN_FREE_DISK_BYTES / (1024 ** 3)))
  const pad = compact ? 'p-2.5' : 'p-3'
  const textSm = compact ? 'text-[10px]' : 'text-[11px]'

  if (loading) {
    return (
      <div className={`rounded-xl border border-glass-border bg-bg-card/80 ${pad}`}>
        <p className={`${textSm} text-text-muted`}>{t('apiKeyGuide.ollamaPreflight.loading')}</p>
      </div>
    )
  }

  if (loadFailed || !preflight) {
    return (
      <div className={`rounded-xl border border-glass-border bg-bg-card/80 space-y-2 ${pad}`}>
        <h3 className={`font-bold text-text ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {t('apiKeyGuide.ollamaPreflight.title')}
        </h3>
        <p className={`${textSm} text-amber-400/90 leading-snug`}>{t('apiKeyGuide.ollamaPreflight.loadFailed')}</p>
        <p className={`${textSm} text-text-muted leading-snug`}>{t('apiKeyGuide.ollamaPreflight.bodyIntro')}</p>
        <ul className={`${textSm} text-text-muted list-disc pl-4 space-y-1 leading-snug`}>
          <li>{t('apiKeyGuide.ollamaPreflight.bulletDisk', { diskMin: diskMinGib })}</li>
          <li>{t('apiKeyGuide.ollamaPreflight.bulletRam', { ramMin: ramMinGib })}</li>
          {os === 'windows' ? (
            <li>{t('apiKeyGuide.ollamaPreflight.bulletWindows')}</li>
          ) : (
            <li>{t('apiKeyGuide.ollamaPreflight.bulletMacLinux')}</li>
          )}
        </ul>
      </div>
    )
  }

  const {
    totalRamBytes,
    freeDiskBytes,
    freeDiskCheckPath,
    wslReadyForOllama,
    ramMeetsRecommendation,
    diskMeetsRecommendation
  } = preflight

  const wslLineValue = wslReadyForOllama
    ? t('apiKeyGuide.ollamaPreflight.wslReady')
    : wslState
      ? t(`envCheck.wslState.${wslStateToEnvCheckKey(wslState)}`)
      : t('apiKeyGuide.ollamaPreflight.wslUnknown')

  return (
    <div className={`rounded-xl border border-glass-border bg-bg-card/80 space-y-2 ${pad}`}>
      <h3 className={`font-bold text-text ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {t('apiKeyGuide.ollamaPreflight.title')}
      </h3>
      <p className={`${textSm} text-text-muted leading-snug`}>{t('apiKeyGuide.ollamaPreflight.bodyIntro')}</p>
      <ul className={`${textSm} text-text-muted list-disc pl-4 space-y-1 leading-snug`}>
        <li>{t('apiKeyGuide.ollamaPreflight.bulletDisk', { diskMin: diskMinGib })}</li>
        <li>{t('apiKeyGuide.ollamaPreflight.bulletRam', { ramMin: ramMinGib })}</li>
        {os === 'windows' ? (
          <li>{t('apiKeyGuide.ollamaPreflight.bulletWindows')}</li>
        ) : (
          <li>{t('apiKeyGuide.ollamaPreflight.bulletMacLinux')}</li>
        )}
      </ul>

      <div className={`space-y-1.5 ${compact ? 'pt-0.5' : 'pt-1'} border-t border-glass-border/60`}>
        <PreflightRow
          label={t('apiKeyGuide.ollamaPreflight.rowRam')}
          value={`${toGiBOneDecimal(totalRamBytes)} GiB`}
          ok={ramMeetsRecommendation}
          compact={compact}
        />
        {freeDiskBytes === null ? (
          <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${textSm}`}>
            <span className="text-text-muted">{t('apiKeyGuide.ollamaPreflight.rowDisk', { path: freeDiskCheckPath })}</span>
            <span className="text-text-muted/80">{t('apiKeyGuide.ollamaPreflight.rowDiskUnknown')}</span>
          </div>
        ) : (
          <PreflightRow
            label={t('apiKeyGuide.ollamaPreflight.rowDisk', { path: freeDiskCheckPath })}
            value={`${toGiBOneDecimal(freeDiskBytes)} GiB`}
            ok={diskMeetsRecommendation === true}
            compact={compact}
          />
        )}
        {os === 'windows' && (
          <PreflightRow label={t('apiKeyGuide.ollamaPreflight.rowWsl')} value={wslLineValue} ok={wslReadyForOllama} compact={compact} />
        )}
      </div>

      {os === 'windows' && !wslReadyForOllama && (
        <p className={`${textSm} text-amber-400/90 font-medium leading-snug`}>
          {t('apiKeyGuide.ollamaPreflight.wslNotReady')}
        </p>
      )}
    </div>
  )
}

function PreflightRow({
  label,
  value,
  ok,
  compact
}: {
  label: string
  value: string
  ok: boolean
  compact?: boolean
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const sz = compact ? 'text-[10px]' : 'text-[11px]'
  const status = ok ? t('apiKeyGuide.ollamaPreflight.statusOk') : t('apiKeyGuide.ollamaPreflight.statusLow')
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${sz}`}>
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="font-mono text-text/90 tabular-nums min-w-0 break-all">{value}</span>
      <span className={ok ? 'text-[var(--color-success)] font-medium' : 'text-amber-400/90 font-medium'}>{status}</span>
    </div>
  )
}
