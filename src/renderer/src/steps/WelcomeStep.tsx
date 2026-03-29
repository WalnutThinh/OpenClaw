import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import Button from '../components/Button'
import LanguageSwitcher from '../components/LanguageSwitcher'
import OpenClawBrandCenter from '../components/OpenClawBrandCenter'
import enchanteDirectionSrc from '../assets/enchante-direction-black.svg'

const TERMS_URL = 'https://enchante.cloud'
const PRIVACY_URL = 'https://enchante.cloud'

/** In-app first run (sau khi cài xong): điều khoản + Get Started — không phải màn setup.exe. */
export default function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const { t } = useTranslation('steps')
  const [termsAccepted, setTermsAccepted] = useState(false)

  return (
    <div className="relative z-10 isolate flex flex-1 flex-col items-center justify-center px-8 pb-8 pt-4">
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="relative flex w-full max-w-md flex-col items-center gap-8 text-center">
        <div className="pointer-events-none absolute inset-0 mx-auto aspect-square max-w-md scale-150 rounded-full bg-primary/10 blur-3xl" />
        <OpenClawBrandCenter />

        <div className="relative flex flex-col items-center gap-3">
          <h1 className="text-[15px] font-medium tracking-tight text-text-muted sm:text-base">
            {t('welcome.installingTitle')}
          </h1>
          <div className="flex items-center justify-center gap-2 text-[11px] text-text-muted/55">
            <span>{t('welcome.customizedBy')}</span>
            <img
              src={enchanteDirectionSrc}
              alt="Enchante"
              className="h-[22px] w-auto max-w-[120px] object-contain object-left brightness-0 invert opacity-90"
            />
          </div>
        </div>

        <label className="border-glass-border flex w-full cursor-pointer select-text items-start gap-3 rounded-xl border bg-white/[0.03] px-4 py-3 text-left text-xs leading-snug text-text-muted transition-colors hover:border-white/15 hover:bg-white/[0.05]">
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
          className="relative z-30 w-full min-w-[200px] sm:w-auto"
          disabled={!termsAccepted}
          onClick={onNext}
        >
          {t('welcome.start')}
        </Button>
      </div>
    </div>
  )
}
