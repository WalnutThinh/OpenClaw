import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import Button from '../components/Button'
import LanguageSwitcher from '../components/LanguageSwitcher'
import OpenClawBrandCenter from '../components/OpenClawBrandCenter'
import WelcomePolicyBody from '../components/WelcomePolicyBody'

const TERMS_URL = 'https://enchante.cloud'
const PRIVACY_URL = 'https://enchante.cloud'

/** First step after opening the app: read terms (scroll), accept, then Get Started. */
export default function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const { t } = useTranslation('steps')
  const [termsAccepted, setTermsAccepted] = useState(false)

  return (
    <div className="relative z-10 isolate flex min-h-0 flex-1 flex-col px-6 pb-6 pt-3 sm:px-8">
      <div className="absolute right-4 top-3 z-20 sm:right-6 sm:top-4">
        <LanguageSwitcher />
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center gap-4 text-center sm:gap-5">
        <div className="pointer-events-none absolute inset-0 mx-auto aspect-square max-w-md scale-150 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mt-1 shrink-0">
          <OpenClawBrandCenter />
        </div>

        <p className="relative max-w-sm text-xs leading-snug text-text-muted sm:text-[13px]">{t('welcome.policyHint')}</p>

        <div className="border-glass-border relative w-full min-h-[120px] max-h-[min(220px,40vh)] flex-1 overflow-y-auto rounded-xl border bg-white/[0.04] px-3 py-3 text-left sm:min-h-[140px] sm:px-4">
          <WelcomePolicyBody />
        </div>

        <label className="border-glass-border relative flex w-full cursor-pointer select-text items-start gap-3 rounded-xl border bg-white/[0.03] px-3 py-3 text-left text-[11px] leading-snug text-text-muted transition-colors hover:border-white/15 hover:bg-white/[0.05] sm:px-4 sm:text-xs">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="border-glass-border bg-bg-input focus:ring-primary/40 mt-0.5 h-4 w-4 shrink-0 rounded border accent-[#105a41]"
          />
          <span className="min-w-0 pt-0.5">
            <Trans
              t={t}
              i18nKey="welcome.termsAgree"
              components={{
                terms: (
                  <a
                    href={TERMS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary/90 underline decoration-primary/35 underline-offset-2 hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                ),
                privacy: (
                  <a
                    href={PRIVACY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary/90 underline decoration-primary/35 underline-offset-2 hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                )
              }}
            />
          </span>
        </label>

        <Button
          variant="primary"
          size="lg"
          className="relative z-30 mt-auto w-full min-w-[200px] shrink-0 sm:w-auto"
          disabled={!termsAccepted}
          onClick={onNext}
        >
          {t('welcome.start')}
        </Button>
      </div>
    </div>
  )
}
