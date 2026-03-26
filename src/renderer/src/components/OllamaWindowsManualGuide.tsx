import { Trans, useTranslation } from 'react-i18next'
import { OLLAMA_DOWNLOAD_URL, OLLAMA_FAQ_URL } from '../constants/openclaw'
import step51 from '../assets/ollama-windows-env/step-5-1-search.png'
import step52 from '../assets/ollama-windows-env/step-5-2-system-properties.png'
import step53 from '../assets/ollama-windows-env/step-5-3-env-variables.png'
import step54 from '../assets/ollama-windows-env/step-5-4-new-variable.png'

const step5Images = [step51, step52, step53, step54] as const

const imgClass = 'mt-1 max-h-40 w-auto max-w-full rounded-md border border-glass-border/60 object-contain shadow-sm'

type Props = {
  className?: string
  /** Model step: hide the main heading so the list does not repeat the Config card title. */
  showHeading?: boolean
}

/** Step-by-step: install Ollama for Windows + OLLAMA_HOST for WSL. i18n: `config.ollamaGuide.manual.*` */
export function OllamaWindowsManualGuide({
  className = '',
  showHeading = true
}: Props) {
  const { t } = useTranslation('steps')

  return (
    <div className={`space-y-2 ${className}`}>
      {showHeading ? (
        <p className="text-[11px] font-extrabold text-primary">{t('config.ollamaGuide.manual.title')}</p>
      ) : null}
      <ol className="list-decimal space-y-2 pl-4 text-[10px] leading-snug text-text-muted">
        <li>
          <Trans
            t={t}
            i18nKey="config.ollamaGuide.manual.step01"
            components={{
              downloadLink: (
                <a
                  href={OLLAMA_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-primary underline decoration-primary/50 underline-offset-2"
                />
              ),
              strong: <strong />
            }}
          />
        </li>
        <li>{t('config.ollamaGuide.manual.step02')}</li>
        <li>{t('config.ollamaGuide.manual.step03')}</li>
        <li>{t('config.ollamaGuide.manual.step04')}</li>
        <li className="space-y-2">
          <span>{t('config.ollamaGuide.manual.step05')}</span>
          <ol className="mt-1 list-none space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="space-y-1">
                <span>{t(`config.ollamaGuide.manual.step05_${i + 1}`)}</span>
                <img
                  src={step5Images[i]}
                  alt=""
                  className={imgClass}
                  loading="lazy"
                  decoding="async"
                />
              </li>
            ))}
          </ol>
        </li>
        <li>{t('config.ollamaGuide.manual.step06')}</li>
        <li>{t('config.ollamaGuide.manual.step07')}</li>
        <li>{t('config.ollamaGuide.manual.step08')}</li>
        <li>{t('config.ollamaGuide.manual.step09')}</li>
        <li>
          <Trans
            t={t}
            i18nKey="config.ollamaGuide.manual.step10"
            components={{
              code: <code className="font-mono text-[10px] text-text-muted" />,
              faqLink: (
                <a
                  href={OLLAMA_FAQ_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-primary underline decoration-primary/50 underline-offset-2"
                />
              ),
            }}
          />
        </li>
      </ol>
    </div>
  )
}
