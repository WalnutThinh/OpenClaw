import { useTranslation } from 'react-i18next'
import OpenClawHeaderBrand from './OpenClawHeaderBrand'

const defaultSteps = [
  'welcome',
  'envCheck',
  'install',
  'apiKeyGuide',
  'appchatGuide',
  'skills',
  'additionalApis',
  'config',
  'done'
]

const windowsSteps = [
  'welcome',
  'envCheck',
  'wslSetup',
  'install',
  'apiKeyGuide',
  'appchatGuide',
  'skills',
  'additionalApis',
  'config',
  'done'
]

export default function StepIndicator({
  currentStep,
  isWindows = false
}: {
  currentStep: string
  isWindows?: boolean
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const steps = isWindows ? windowsSteps : defaultSteps
  const labels = (
    isWindows
      ? t('indicator.windows', { returnObjects: true })
      : t('indicator.default', { returnObjects: true })
  ) as string[]
  const total = labels.length
  const current = Math.max(0, steps.indexOf(currentStep))

  return (
    <div className="shrink-0 px-6 pb-2 pt-5 sm:px-8">
      <div className="mb-4 flex justify-center">
        <OpenClawHeaderBrand />
      </div>
      {/* Dot indicators with connecting line */}
      <div className="relative flex items-center justify-between">
        {/* Background line */}
        <div className="absolute top-1/2 left-2 right-2 h-[2px] -translate-y-1/2 bg-white/8 rounded-full" />
        {/* Active line */}
        <div
          className="absolute top-1/2 left-2 h-[2px] -translate-y-1/2 rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-primary via-fuchsia-500 to-primary-hover"
          style={{ width: `${(current / (total - 1)) * 100}%` }}
        />

        {labels.map((label, i) => {
          const isActive = i <= current
          const isCurrent = i === current

          return (
            <div key={i} className="relative flex flex-col items-center z-10">
              <div
                className={`w-3 h-3 rounded-full transition-all duration-500 ${
                  isCurrent
                    ? 'bg-primary scale-125 shadow-[0_0_10px_var(--color-primary-glow)]'
                    : isActive
                      ? 'bg-primary/80'
                      : 'bg-white/15'
                }`}
                style={
                  isCurrent
                    ? {
                        animation: 'glow-pulse 2s ease-in-out infinite',
                        color: 'var(--color-primary)'
                      }
                    : {}
                }
              />
              <span
                className={`mt-2 text-[10px] font-semibold tracking-wide transition-all duration-500 ${
                  isCurrent ? 'text-primary' : isActive ? 'text-text/70' : 'text-text-muted/50'
                }`}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
