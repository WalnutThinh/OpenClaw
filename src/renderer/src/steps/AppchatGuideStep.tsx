import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import { TelegramGuideFigures, ZaloBotGuideFigures } from '../components/ChatProviderGuideFigures'
import { ZALO_OA_ENABLED } from '../constants/channels'
import { ZALO_BOT_DOCS_URL } from '../constants/openclaw'

export type ChatPlatform = 'telegram' | 'zalo' | 'lark'
export type ZaloSubTab = 'bot' | 'oa'

const TAB_ORDER: ChatPlatform[] = ['zalo', 'telegram', 'lark']

interface Props {
  telegramToken: string
  onTelegramTokenChange: (v: string) => void
  zaloBotToken: string
  onZaloBotTokenChange: (v: string) => void
  zaloOaId: string
  onZaloOaIdChange: (v: string) => void
  zaloOaSecret: string
  onZaloOaSecretChange: (v: string) => void
  larkAppId: string
  onLarkAppIdChange: (v: string) => void
  larkAppSecret: string
  onLarkAppSecretChange: (v: string) => void
  onNext: () => void
}

export default function AppchatGuideStep({
  telegramToken,
  onTelegramTokenChange,
  zaloBotToken,
  onZaloBotTokenChange,
  zaloOaId,
  onZaloOaIdChange,
  zaloOaSecret,
  onZaloOaSecretChange,
  larkAppId,
  onLarkAppIdChange,
  larkAppSecret,
  onLarkAppSecretChange,
  onNext
}: Props): React.JSX.Element {
  const { t } = useTranslation('steps')
  const [tab, setTab] = useState<ChatPlatform>('zalo')
  const [zaloSub, setZaloSub] = useState<ZaloSubTab>('bot')

  useEffect(() => {
    if (!ZALO_OA_ENABLED) {
      onZaloOaIdChange('')
      onZaloOaSecretChange('')
    }
  }, [onZaloOaIdChange, onZaloOaSecretChange])

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-2">
      <div className="shrink-0 space-y-0.5 pb-2 pt-2 text-center">
        <h2 className="text-lg font-extrabold">{t('modelChat.title')}</h2>
        <p className="text-xs text-text-muted">{t('modelChat.subtitle')}</p>
      </div>

      <div className="flex shrink-0 overflow-hidden rounded-xl border border-glass-border bg-bg-card">
        {TAB_ORDER.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-[11px] font-bold transition-colors ${
              i > 0 ? 'border-l border-glass-border' : ''
            } ${tab === id ? 'bg-primary/12 text-primary' : 'text-text-muted hover:bg-white/5'}`}
          >
            {t(`modelChat.tab.${id}`)}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {tab === 'zalo' && ZALO_OA_ENABLED && (
          <div className="flex shrink-0 gap-1 rounded-lg border border-glass-border bg-black/20 p-0.5">
            <button
              type="button"
              onClick={() => setZaloSub('bot')}
              className={`flex-1 rounded-md py-1.5 text-[10px] font-bold transition-colors ${
                zaloSub === 'bot' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:bg-white/5'
              }`}
            >
              {t('modelChat.zaloSubTabBot')}
            </button>
            <button
              type="button"
              onClick={() => setZaloSub('oa')}
              className={`flex-1 rounded-md py-1.5 text-[10px] font-bold transition-colors ${
                zaloSub === 'oa' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:bg-white/5'
              }`}
            >
              {t('modelChat.zaloSubTabOa')}
            </button>
          </div>
        )}

        <p className="whitespace-pre-line text-[11px] leading-relaxed text-text-muted">
          {tab === 'zalo' && (!ZALO_OA_ENABLED || zaloSub === 'bot') && t('modelChat.guide.zaloBot')}
          {tab === 'zalo' && ZALO_OA_ENABLED && zaloSub === 'oa' && t('modelChat.guide.zaloOa')}
          {tab !== 'zalo' && t(`modelChat.guide.${tab}`)}
        </p>

        {tab === 'zalo' && (!ZALO_OA_ENABLED || zaloSub === 'bot') && (
          <a
            href={ZALO_BOT_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-[11px] font-semibold text-primary hover:underline"
          >
            {t('modelChat.zaloOpenDocs')} →
          </a>
        )}

        {tab === 'telegram' && (
          <div className="space-y-3">
            <TelegramGuideFigures />
            <div className="space-y-1.5">
            <label className="text-xs font-bold">{t('config.telegramToken')}</label>
            <input
              type="text"
              placeholder="123456:ABCDEF..."
              value={telegramToken}
              onChange={(e) => onTelegramTokenChange(e.target.value)}
              className="w-full rounded-xl border border-glass-border bg-bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
            </div>
          </div>
        )}

        {tab === 'zalo' && (!ZALO_OA_ENABLED || zaloSub === 'bot') && (
          <div className="space-y-3">
            <ZaloBotGuideFigures />
            <div className="space-y-1.5">
            <label className="text-xs font-bold">{t('config.zaloBotToken')}</label>
            <input
              type="password"
              autoComplete="off"
              placeholder={t('config.zaloBotTokenPlaceholder')}
              value={zaloBotToken}
              onChange={(e) => onZaloBotTokenChange(e.target.value)}
              className="w-full rounded-xl border border-glass-border bg-bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
            </div>
          </div>
        )}

        {tab === 'zalo' && ZALO_OA_ENABLED && zaloSub === 'oa' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-bold">{t('config.zaloOaId')}</label>
              <input
                type="text"
                value={zaloOaId}
                onChange={(e) => onZaloOaIdChange(e.target.value)}
                className="w-full rounded-xl border border-glass-border bg-bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{t('config.zaloOaSecret')}</label>
              <input
                type="password"
                value={zaloOaSecret}
                onChange={(e) => onZaloOaSecretChange(e.target.value)}
                className="w-full rounded-xl border border-glass-border bg-bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        {tab === 'lark' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-bold">{t('config.larkAppId')}</label>
              <input
                type="text"
                value={larkAppId}
                onChange={(e) => onLarkAppIdChange(e.target.value)}
                className="w-full rounded-xl border border-glass-border bg-bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{t('config.larkAppSecret')}</label>
              <input
                type="password"
                value={larkAppSecret}
                onChange={(e) => onLarkAppSecretChange(e.target.value)}
                className="w-full rounded-xl border border-glass-border bg-bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 pt-3">
        <Button variant="primary" size="sm" onClick={onNext}>
          {t('install.nextBtn')}
        </Button>
      </div>
    </div>
  )
}
