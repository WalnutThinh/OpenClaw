import { useTranslation } from 'react-i18next'
import type { OllamaWslSetupGuide } from '@shared/ollama-wsl-setup-guide'
import { OllamaWindowsManualGuide } from './OllamaWindowsManualGuide'

/** Shown on Config before save when the user picked Ollama on Windows (WSL). */
export function OllamaWindowsPrepCard() {
  return (
    <div className="glass-card space-y-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-3 text-xs">
      <OllamaWindowsManualGuide showHeading />
    </div>
  )
}

/** After save attempt: scenario-specific steps derived from main-process probes (no log parsing). */
export function OllamaWslIssueGuide({ guide }: { guide: OllamaWslSetupGuide }): React.JSX.Element {
  const { t } = useTranslation('steps')
  const p = `config.ollamaGuide.scenarios.${guide.variant}` as const
  const stepKeys =
    guide.variant === 'nothing_on_11434'
      ? ([1, 2, 3, 4] as const)
      : guide.variant === 'bind_for_wsl'
        ? ([1, 2, 3] as const)
        : ([1, 2] as const)

  return (
    <div
      className="glass-card space-y-2 rounded-xl border border-[color-mix(in_oklab,var(--color-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_8%,transparent)] p-3 text-xs"
      role="region"
      aria-label={t(`${p}.title`)}
    >
      <p className="text-[11px] font-extrabold text-warning">{t(`${p}.title`)}</p>
      <p className="text-text-muted text-[10px] leading-snug">{t(`${p}.lead`)}</p>
      {guide.attemptedBaseUrl && (
        <p className="text-text-muted font-mono text-[10px] leading-snug">
          {t('config.ollamaGuide.attemptedUrlLabel', { url: guide.attemptedBaseUrl })}
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-4 text-[10px] leading-snug text-text-muted">
        {stepKeys.map((n) => (
          <li key={n}>{t(`${p}.step${n}`)}</li>
        ))}
      </ol>
      {guide.variant === 'nothing_on_11434' && !guide.winStandardInstallFound && (
        <p className="text-warning/90 text-[10px] font-semibold leading-snug">{t(`${p}.noteNoWinExe`)}</p>
      )}
      <OllamaWindowsManualGuide className="border-t border-glass-border/40 pt-2" showHeading={false} />
    </div>
  )
}
