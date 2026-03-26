import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

export default function UpdateBanner(): React.JSX.Element | null {
  const { t } = useTranslation('management')
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const unsubs = [
      window.electronAPI.update.onAvailable((info) => {
        setVersion(info.version)
        setState('available')
      }),
      window.electronAPI.update.onProgress((p) => {
        setPercent(p)
        setState('downloading')
      }),
      window.electronAPI.update.onDownloaded(() => {
        setState('downloaded')
      }),
      window.electronAPI.update.onError(() => {
        setState('idle')
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (state === 'idle' || state === 'error') return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-3">
      <div className="glass-card flex items-center gap-3 px-4 py-2.5 !rounded-xl border-primary/30">
        {state === 'available' && (
          <>
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold flex-1">
              {t('updateBanner.available', { version })}
            </span>
            <button
              onClick={() => window.electronAPI.update.download()}
              className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              {t('updateBanner.download')}
            </button>
          </>
        )}

        {state === 'downloading' && (
          <>
            <span className="text-xs font-semibold flex-1">
              {t('updateBanner.downloading', { percent })}
            </span>
            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </>
        )}

        {state === 'downloaded' && (
          <>
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs font-semibold flex-1">{t('updateBanner.ready')}</span>
            <button
              onClick={() => window.electronAPI.update.install()}
              className="text-xs font-bold text-success hover:text-success/80 transition-colors"
            >
              {t('updateBanner.restartNow')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
