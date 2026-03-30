import { useTranslation } from 'react-i18next'

/** Welcome scroll panel: user responsibilities + usage regulations (i18n). */
export default function WelcomePolicyBody(): React.JSX.Element {
  const { t } = useTranslation('steps')
  const p = 'mb-2.5 text-left text-[11px] leading-snug text-text-muted last:mb-0 sm:text-xs'
  const h = 'mb-1.5 mt-3 text-left text-[11px] font-semibold text-text/90 first:mt-0 sm:text-xs'
  const li = 'text-left text-[11px] leading-snug text-text-muted sm:text-xs'

  return (
    <div className="text-text-muted">
      <p className={`${h} !mt-0`}>{t('welcome.userInfoTitle')}</p>
      <ul className={`mb-2.5 list-inside list-disc space-y-1.5 pl-0.5 marker:text-text-muted/60`}>
        <li className={li}>{t('welcome.userInfo1')}</li>
        <li className={li}>{t('welcome.userInfo2')}</li>
        <li className={li}>{t('welcome.userInfo3')}</li>
        <li className={li}>{t('welcome.userInfo4')}</li>
      </ul>

      <p className={h}>{t('welcome.usageRulesTitle')}</p>
      <ul className={`mb-2.5 list-inside list-disc space-y-1.5 pl-0.5 marker:text-text-muted/60`}>
        <li className={li}>{t('welcome.usageRule1')}</li>
        <li className={li}>{t('welcome.usageRule2')}</li>
        <li className={li}>{t('welcome.usageRule3')}</li>
        <li className={li}>{t('welcome.usageRule4')}</li>
        <li className={li}>{t('welcome.usageRule5')}</li>
      </ul>

      <p className={h}>{t('welcome.legalNoteTitle')}</p>
      <p className={p}>{t('welcome.legalNoteBody')}</p>
      <p className={p}>
        <strong className="text-text-muted">{t('welcome.privacyTitle')}</strong> {t('welcome.privacyBody')}
      </p>
      <p className={p}>
        <strong className="text-text-muted">{t('welcome.updatesTitle')}</strong> {t('welcome.updatesBody')}
      </p>
      <p className={p}>
        <strong className="text-text-muted">{t('welcome.liabilityTitle')}</strong> {t('welcome.liabilityBody')}
      </p>
      <p className={p}>{t('welcome.declineHint')}</p>
    </div>
  )
}
