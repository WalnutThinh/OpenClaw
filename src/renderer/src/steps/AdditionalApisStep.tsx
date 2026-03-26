import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import GmailAppPasswordLinks from '../components/GmailAppPasswordLinks'
import PasswordInput from '../components/PasswordInput'
import { BUNDLED_EMAIL_SKILL_ID, BUNDLED_GOOGLE_WORKSPACE_SKILL_ID } from '../constants/bundled-skills'
import type { Provider } from '../constants/providers'
import gmailGoogleAppPasswordExample from '../assets/gmail-google-app-password-example.png'
import {
  GOOGLE_CLOUD_API_LIBRARY_URL,
  GOOGLE_CLOUD_CALENDAR_API_URL,
  GOOGLE_CLOUD_CREDENTIALS_URL,
  GOOGLE_CLOUD_DOCS_API_URL,
  GOOGLE_CLOUD_DRIVE_API_URL,
  GOOGLE_CLOUD_OAUTH_CONSENT_URL,
  GOOGLE_CLOUD_PROJECT_CREATE_URL,
  GOOGLE_CLOUD_SERVICE_ACCOUNTS_URL,
  GOOGLE_CLOUD_SHEETS_API_URL,
  GOOGLE_CLOUD_SLIDES_API_URL,
  GOOGLE_OAUTH_SETUP_GUIDE_URL
} from '../constants/google-account'

function isValidGoogleServiceAccountJson(content: string): boolean {
  try {
    const o = JSON.parse(content) as { type?: string; client_email?: string; private_key?: string }
    return (
      o?.type === 'service_account' &&
      typeof o.client_email === 'string' &&
      typeof o.private_key === 'string' &&
      o.private_key.length > 0
    )
  } catch {
    return false
  }
}

const googleProductApiLinks: { key: string; href: string }[] = [
  { key: 'sheets', href: GOOGLE_CLOUD_SHEETS_API_URL },
  { key: 'docs', href: GOOGLE_CLOUD_DOCS_API_URL },
  { key: 'slides', href: GOOGLE_CLOUD_SLIDES_API_URL },
  { key: 'drive', href: GOOGLE_CLOUD_DRIVE_API_URL },
  { key: 'calendar', href: GOOGLE_CLOUD_CALENDAR_API_URL }
]

function formatGiB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1)
}

export default function AdditionalApisStep({
  bundledSkillIds,
  bundledCredentialsBySkill,
  enableNemoShield,
  onToggleNemo,
  onBundledCredentialChange,
  provider,
  modelId,
  onGoChooseAiProvider,
  onNext
}: {
  bundledSkillIds: string[]
  bundledCredentialsBySkill: Record<string, Record<string, string>>
  enableNemoShield: boolean
  onToggleNemo: (enabled: boolean) => void
  onBundledCredentialChange: (skillId: string, fieldId: string, value: string) => void
  provider: Provider
  modelId?: string
  onGoChooseAiProvider: () => void
  onNext: () => void
}): React.JSX.Element {
  const { t } = useTranslation('steps')

  const hasEmailBundled = bundledSkillIds.includes(BUNDLED_EMAIL_SKILL_ID)
  const emailCreds = bundledCredentialsBySkill[BUNDLED_EMAIL_SKILL_ID] ?? {}
  const hasGoogleWorkspaceBundled = bundledSkillIds.includes(BUNDLED_GOOGLE_WORKSPACE_SKILL_ID)
  const googleWorkspaceCreds = bundledCredentialsBySkill[BUNDLED_GOOGLE_WORKSPACE_SKILL_ID] ?? {}
  const workspaceSaJson = googleWorkspaceCreds.serviceAccountJson ?? ''

  const canProceed = useMemo(() => {
    const emailOk =
      !hasEmailBundled ||
      (Boolean(emailCreds.email?.trim()) && Boolean(emailCreds.password?.trim()))
    const workspaceOk =
      !hasGoogleWorkspaceBundled ||
      (workspaceSaJson.trim().length > 0 && isValidGoogleServiceAccountJson(workspaceSaJson))
    return emailOk && workspaceOk
  }, [
    hasEmailBundled,
    emailCreds.email,
    emailCreds.password,
    hasGoogleWorkspaceBundled,
    workspaceSaJson
  ])

  const workspaceSaInvalid =
    hasGoogleWorkspaceBundled &&
    workspaceSaJson.trim().length > 0 &&
    !isValidGoogleServiceAccountJson(workspaceSaJson)

  const onWorkspaceSaFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (): void => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        onBundledCredentialChange(BUNDLED_GOOGLE_WORKSPACE_SKILL_ID, 'serviceAccountJson', text)
      }
      reader.readAsText(file, 'utf-8')
      e.target.value = ''
    },
    [onBundledCredentialChange]
  )

  const [diskGate, setDiskGate] = useState<{
    freeBytes: number
    requiredBytes: number
    checkPath: string
  } | null>(null)
  const [diskCheckBusy, setDiskCheckBusy] = useState(false)

  const runDiskCheckAndProceed = useCallback(async (): Promise<void> => {
    if (provider !== 'ollama') {
      onNext()
      return
    }
    setDiskCheckBusy(true)
    try {
      const r = await window.electronAPI.env.checkOllamaWizardDisk(modelId)
      if (!r.ok && r.freeBytes !== null) {
        setDiskGate({
          freeBytes: r.freeBytes,
          requiredBytes: r.requiredBytes,
          checkPath: r.checkPath
        })
        return
      }
      setDiskGate(null)
      onNext()
    } finally {
      setDiskCheckBusy(false)
    }
  }, [provider, modelId, onNext])

  const handleDiskRetry = (): void => {
    void runDiskCheckAndProceed()
  }

  const handleChooseOtherAi = (): void => {
    setDiskGate(null)
    onGoChooseAiProvider()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-4">
      <div className="shrink-0 space-y-0.5 pb-2 pt-2 text-center">
        <h2 className="text-lg font-extrabold">{t('additionalApis.title')}</h2>
        <p className="text-[11px] text-text-muted">{t('additionalApis.subtitle')}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <div className="glass-card space-y-2 rounded-xl border border-primary/20 p-3 text-xs">
          <p className="font-bold text-primary">{t('config.nemoSectionTitle')}</p>
          <p className="text-text-muted text-[10px] leading-relaxed">{t('config.nemoSectionSubtitle')}</p>
          <label className="border-glass-border flex cursor-pointer items-start gap-2.5 rounded-lg border bg-black/15 p-2.5 transition-colors hover:bg-white/5">
            <input
              type="checkbox"
              className="border-glass-border mt-0.5 rounded"
              checked={enableNemoShield}
              onChange={(e) => onToggleNemo(e.target.checked)}
            />
            <span className="text-[11px] font-semibold leading-snug">{t('config.nemoEnableLabel')}</span>
          </label>
        </div>

        <div className="glass-card space-y-3 rounded-xl border border-primary/15 p-3 text-xs">
          <div>
            <p className="font-bold text-primary">{t('additionalApis.googleSectionTitle')}</p>
            <p className="text-text-muted mt-1 text-[10px] leading-relaxed">
              {t('additionalApis.googleGuideIntro')}
            </p>
          </div>

          <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
            <p className="text-[11px] font-bold text-primary/95">{t('additionalApis.googleStep1Title')}</p>
            <p className="text-text-muted text-[10px] leading-relaxed">{t('additionalApis.googleStep1Body')}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              <a
                href={GOOGLE_CLOUD_API_LIBRARY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                {t('additionalApis.googleLinkLibrary')}
              </a>
              {googleProductApiLinks.map(({ key, href }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-semibold text-primary/90 hover:underline"
                >
                  {t(`additionalApis.googleLink.${key}`)}
                </a>
              ))}
            </div>
          </div>

          <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
            <p className="text-[11px] font-bold text-primary/95">{t('additionalApis.googleStep2Title')}</p>
            <p className="text-text-muted text-[10px] leading-relaxed">{t('additionalApis.googleStep2Body')}</p>
            <a
              href={GOOGLE_CLOUD_OAUTH_CONSENT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[10px] font-semibold text-primary hover:underline"
            >
              {t('additionalApis.googleLinkConsent')}
            </a>
          </div>

          <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
            <p className="text-[11px] font-bold text-primary/95">{t('additionalApis.googleStep3Title')}</p>
            <p className="text-text-muted text-[10px] leading-relaxed">{t('additionalApis.googleStep3Body')}</p>
          </div>

          <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
            <p className="text-[11px] font-bold text-primary/95">{t('additionalApis.googleStep4Title')}</p>
            <p className="text-text-muted text-[10px] leading-relaxed">{t('additionalApis.googleStep4Body')}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              <a
                href={GOOGLE_CLOUD_CREDENTIALS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                {t('additionalApis.googleLinkCredentials')}
              </a>
              <a
                href={GOOGLE_OAUTH_SETUP_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-semibold text-primary/90 hover:underline"
              >
                {t('additionalApis.googleLinkOAuthDoc')}
              </a>
            </div>
          </div>

          <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
            <p className="text-[11px] font-bold text-primary/95">{t('additionalApis.googleStep5Title')}</p>
            <p className="text-text-muted text-[10px] leading-relaxed">{t('additionalApis.googleStep5Body')}</p>
          </div>
        </div>

        {hasGoogleWorkspaceBundled && (
          <div className="glass-card space-y-3 rounded-xl border border-accent/25 p-3 text-xs">
            <div>
              <p className="font-bold text-accent">{t('additionalApis.googleWorkspaceSaSectionTitle')}</p>
              <p className="text-text-muted mt-1 text-[10px] leading-relaxed">
                {t('additionalApis.googleWorkspaceSaIntro')}
              </p>
            </div>

            <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
              <p className="text-[11px] font-bold text-primary/95">
                {t('additionalApis.googleWorkspaceSaStep1Title')}
              </p>
              <p className="text-text-muted text-[10px] leading-relaxed">
                {t('additionalApis.googleWorkspaceSaStep1Body')}
              </p>
              <a
                href={GOOGLE_CLOUD_PROJECT_CREATE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[10px] font-semibold text-primary hover:underline"
              >
                {t('additionalApis.googleWorkspaceSaLinkNewProject')}
              </a>
            </div>

            <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
              <p className="text-[11px] font-bold text-primary/95">
                {t('additionalApis.googleWorkspaceSaStep2Title')}
              </p>
              <p className="text-text-muted text-[10px] leading-relaxed">
                {t('additionalApis.googleWorkspaceSaStep2Body')}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                <a
                  href={GOOGLE_CLOUD_API_LIBRARY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  {t('additionalApis.googleLinkLibrary')}
                </a>
                {googleProductApiLinks.map(({ key, href }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-primary/90 hover:underline"
                  >
                    {t(`additionalApis.googleLink.${key}`)}
                  </a>
                ))}
              </div>
            </div>

            <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
              <p className="text-[11px] font-bold text-primary/95">
                {t('additionalApis.googleWorkspaceSaStep3Title')}
              </p>
              <p className="text-text-muted text-[10px] leading-relaxed">
                {t('additionalApis.googleWorkspaceSaStep3Body')}
              </p>
              <a
                href={GOOGLE_CLOUD_SERVICE_ACCOUNTS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[10px] font-semibold text-primary hover:underline"
              >
                {t('additionalApis.googleWorkspaceSaLinkServiceAccounts')}
              </a>
            </div>

            <div className="border-glass-border space-y-1.5 border-t border-dashed border-white/10 pt-3">
              <p className="text-[11px] font-bold text-primary/95">
                {t('additionalApis.googleWorkspaceSaStep4Title')}
              </p>
              <p className="text-text-muted text-[10px] leading-relaxed">
                {t('additionalApis.googleWorkspaceSaStep4Body')}
              </p>
            </div>

            <div className="border-glass-border space-y-2 border-t border-dashed border-white/10 pt-3">
              <p className="text-[11px] font-bold text-primary/95">
                {t('additionalApis.googleWorkspaceSaStep5Title')}
              </p>
              <p className="text-text-muted text-[10px] leading-relaxed">
                {t('additionalApis.googleWorkspaceSaStep5Body')}
              </p>
              <label className="text-text-muted mb-1 block text-[10px] font-semibold">
                {t('additionalApis.googleWorkspaceSaAttachLabel')}
              </label>
              <input
                type="file"
                accept=".json,application/json"
                className="border-glass-border w-full max-w-xs cursor-pointer text-[10px] file:mr-2 file:rounded-lg file:border-0 file:bg-primary/20 file:px-2 file:py-1 file:text-[10px] file:font-semibold"
                onChange={onWorkspaceSaFile}
              />
              {workspaceSaInvalid ? (
                <p className="text-error text-[10px] font-semibold">{t('additionalApis.googleWorkspaceSaInvalidJson')}</p>
              ) : null}
              <p className="text-text-muted text-[10px] leading-snug">{t('additionalApis.googleWorkspaceSaAttachHint')}</p>
              <p className="text-warning/90 text-[10px] font-semibold leading-snug">
                {t('additionalApis.googleWorkspaceSaShareNote')}
              </p>
              <p className="text-primary/90 text-[10px] font-semibold leading-snug">
                {t('additionalApis.googleWorkspaceSaConfigNote')}
              </p>
            </div>
          </div>
        )}

        {hasEmailBundled && (
          <div className="glass-card space-y-3 rounded-xl border border-primary/25 p-3 text-xs">
            <p className="font-bold text-primary">{t('config.emailBundledSection')}</p>
            <p className="text-[10px] leading-snug text-text-muted">{t('config.emailBundledIntro')}</p>
            <p className="text-primary/90 text-[10px] font-semibold leading-snug">{t('config.emailFlowSteps')}</p>

            <div>
              <label className="text-text-muted mb-1 block text-[10px] font-semibold">
                {t('config.emailSenderLabel')}
              </label>
              <input
                type="text"
                value={emailCreds.email ?? ''}
                onChange={(e) => onBundledCredentialChange(BUNDLED_EMAIL_SKILL_ID, 'email', e.target.value)}
                placeholder={t('skillsStep.emailAddressPlaceholder')}
                className="border-glass-border w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <figure className="overflow-hidden rounded-xl border border-glass-border bg-white/[0.04]">
                <img
                  src={gmailGoogleAppPasswordExample}
                  alt={t('config.emailGmailAppPasswordExampleAlt')}
                  className="max-h-56 w-full object-contain object-top"
                />
                <figcaption className="border-glass-border border-t px-2 py-1.5 text-[10px] leading-snug text-text-muted">
                  {t('config.emailGmailAppPasswordExampleCaption')}
                </figcaption>
              </figure>
            </div>
            <div>
              <label className="text-text-muted mb-1 block text-[10px] font-semibold">
                {t('config.emailAppPasswordFieldLabel')}
                <span className="text-warning/90 font-normal">
                  {' '}
                  ({t('skillsStep.emailPasswordLabelSuffix')})
                </span>
              </label>
              <PasswordInput
                value={emailCreds.password ?? ''}
                onChange={(v) => onBundledCredentialChange(BUNDLED_EMAIL_SKILL_ID, 'password', v)}
                placeholder={t('skillsStep.emailPasswordPlaceholder')}
                className="!py-2"
              />
            </div>
            <p className="text-text-muted text-[10px] leading-snug">
              {t('skillsStep.emailGmailAppPasswordHint')}
            </p>
            <GmailAppPasswordLinks />
            <p className="text-warning/90 text-[10px] font-semibold leading-snug">
              {t('additionalApis.emailThenConfigSave')}
            </p>
          </div>
        )}
      </div>

      {diskGate ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ollama-disk-gate-title"
        >
          <div className="glass-card max-w-md space-y-3 rounded-xl border border-glass-border p-4 shadow-xl">
            <h3 id="ollama-disk-gate-title" className="text-sm font-extrabold text-text">
              {t('additionalApis.ollamaDiskGateTitle')}
            </h3>
            <p className="text-[11px] leading-snug text-text-muted">
              {t('additionalApis.ollamaDiskGateBody', {
                volume: diskGate.checkPath,
                freeGiB: formatGiB(diskGate.freeBytes),
                requiredGiB: formatGiB(diskGate.requiredBytes)
              })}
            </p>
            <p className="text-[10px] leading-snug text-warning/90">{t('additionalApis.ollamaDiskGateRamHint')}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button variant="secondary" size="sm" onClick={handleChooseOtherAi}>
                {t('additionalApis.ollamaDiskChooseOtherAiBtn')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleDiskRetry} loading={diskCheckBusy}>
                {t('additionalApis.ollamaDiskRetryBtn')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 justify-end pt-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void runDiskCheckAndProceed()}
          disabled={!canProceed || diskCheckBusy}
          loading={diskCheckBusy}
        >
          {diskCheckBusy ? t('additionalApis.ollamaDiskCheckingNext') : t('install.nextBtn')}
        </Button>
      </div>
    </div>
  )
}
