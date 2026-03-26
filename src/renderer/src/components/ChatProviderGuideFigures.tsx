import { useTranslation } from 'react-i18next'
import tg1 from '../assets/chat-guide-telegram-1-botfather-search.png'
import tg2 from '../assets/chat-guide-telegram-2-newbot.png'
import tg3 from '../assets/chat-guide-telegram-3-bot-display-name.png'
import tg4 from '../assets/chat-guide-telegram-4-token.png'
import z1 from '../assets/chat-guide-zalo-1-bot-manager-search.png'
import z2 from '../assets/chat-guide-zalo-2-create-bot-button.png'
import z3 from '../assets/chat-guide-zalo-3-4-create-form.png'
import z4 from '../assets/chat-guide-zalo-5-api-message.png'

const telegramSteps = [tg1, tg2, tg3, tg4] as const
const zaloSteps = [z1, z2, z3, z4] as const

function StepFigure({
  prefix,
  src
}: {
  prefix: 's1' | 's2' | 's3' | 's4'
  src: string
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const base = `modelChat.telegramVisual.${prefix}`
  return (
    <figure className="overflow-hidden rounded-xl border border-glass-border bg-white/[0.03]">
      <figcaption className="space-y-0.5 border-b border-glass-border px-2 py-2">
        <p className="text-[11px] font-extrabold text-text">{t(`${base}t`)}</p>
        <p className="text-[10px] leading-snug text-text-muted">{t(`${base}d`)}</p>
      </figcaption>
      <img
        src={src}
        alt={t(`${base}a`)}
        className="max-h-64 w-full object-contain object-top sm:max-h-72"
      />
    </figure>
  )
}

function ZaloStepFigure({
  prefix,
  src
}: {
  prefix: 's1' | 's2' | 's3' | 's4'
  src: string
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const base = `modelChat.zaloBotVisual.${prefix}`
  return (
    <figure className="overflow-hidden rounded-xl border border-glass-border bg-white/[0.03]">
      <figcaption className="space-y-0.5 border-b border-glass-border px-2 py-2">
        <p className="text-[11px] font-extrabold text-text">{t(`${base}t`)}</p>
        <p className="text-[10px] leading-snug text-text-muted">{t(`${base}d`)}</p>
      </figcaption>
      <img
        src={src}
        alt={t(`${base}a`)}
        className="max-h-64 w-full object-contain object-top sm:max-h-72"
      />
    </figure>
  )
}

export function TelegramGuideFigures(): React.JSX.Element {
  const { t } = useTranslation('steps')
  const prefixes: Array<'s1' | 's2' | 's3' | 's4'> = ['s1', 's2', 's3', 's4']
  return (
    <div className="space-y-3 border-t border-dashed border-glass-border pt-3">
      <p className="text-[11px] font-extrabold text-primary">{t('modelChat.telegramVisual.heading')}</p>
      <div className="space-y-3">
        {telegramSteps.map((src, i) => (
          <StepFigure key={prefixes[i]} prefix={prefixes[i]!} src={src} />
        ))}
      </div>
    </div>
  )
}

export function ZaloBotGuideFigures(): React.JSX.Element {
  const { t } = useTranslation('steps')
  const prefixes: Array<'s1' | 's2' | 's3' | 's4'> = ['s1', 's2', 's3', 's4']
  return (
    <div className="space-y-3 border-t border-dashed border-glass-border pt-3">
      <p className="text-[11px] font-extrabold text-primary">{t('modelChat.zaloBotVisual.heading')}</p>
      <p className="text-[10px] font-semibold leading-snug text-warning/90">{t('modelChat.zaloBotVisual.appOnly')}</p>
      <div className="space-y-3">
        {zaloSteps.map((src, i) => (
          <ZaloStepFigure key={prefixes[i]} prefix={prefixes[i]!} src={src} />
        ))}
      </div>
    </div>
  )
}
