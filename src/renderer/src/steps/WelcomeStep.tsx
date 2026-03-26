import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import LanguageSwitcher from '../components/LanguageSwitcher'
import OpenClawBrandCenter from '../components/OpenClawBrandCenter'

export default function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const { t } = useTranslation('steps')

  return (
    <div className="relative z-10 isolate flex flex-1 flex-col items-center justify-center px-10 gap-10">
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="relative flex flex-col items-center">
        <div className="pointer-events-none absolute inset-0 mx-auto aspect-square max-w-md scale-150 rounded-full bg-primary/10 blur-3xl" />
        <OpenClawBrandCenter />
      </div>

      <Button variant="primary" size="lg" className="relative z-30" onClick={onNext}>
        {t('welcome.start')}
      </Button>
    </div>
  )
}
