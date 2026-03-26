import { useTranslation } from 'react-i18next'
import {
  GOOGLE_APP_PASSWORDS_URL,
  GOOGLE_TWO_STEP_VERIFICATION_URL,
  GOOGLE_APP_PASSWORD_HELP_ARTICLE_URL,
  GMAIL_SMTP_APP_PASSWORD_HELP_URL
} from '../constants/google-account'

const linkClass =
  'block text-center text-[11px] font-semibold bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent py-1 hover:opacity-90'

const linkClassSmall =
  'block text-center text-[10px] font-semibold bg-gradient-to-r from-primary/90 to-primary-hover bg-clip-text text-transparent py-0.5 hover:opacity-90'

/**
 * Opens Google pages to enable 2-Step Verification and create an App Password (Gmail IMAP/SMTP).
 * Style matches the “Get API key →” row on the Model & Provider step.
 */
export default function GmailAppPasswordLinks(): React.JSX.Element {
  const { t } = useTranslation('steps')

  return (
    <div className="border-glass-border space-y-0.5 rounded-xl border bg-white/[0.03] px-2 py-2">
      <p className="text-text-muted mb-1 text-[10px] font-bold">{t('skillsStep.gmailLinksTitle')}</p>
      <a href={GOOGLE_APP_PASSWORDS_URL} target="_blank" rel="noreferrer" className={linkClass}>
        {t('skillsStep.gmailLinkAppPasswords')} →
      </a>
      <a
        href={GOOGLE_TWO_STEP_VERIFICATION_URL}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        {t('skillsStep.gmailLinkTwoStep')} →
      </a>
      <a
        href={GOOGLE_APP_PASSWORD_HELP_ARTICLE_URL}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        {t('skillsStep.gmailLinkHelpArticle')} →
      </a>
      <a href={GMAIL_SMTP_APP_PASSWORD_HELP_URL} target="_blank" rel="noreferrer" className={linkClassSmall}>
        {t('skillsStep.gmailLinkSmtpHelp')} →
      </a>
    </div>
  )
}
