import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import LogViewer from '../components/LogViewer'
import { useInstallLogs } from '../hooks/useIpc'

interface InstallNeeds {
  needNode: boolean
  needOpenclaw: boolean
  needPython: boolean
}

export default function InstallStep({
  needs,
  onDone
}: {
  needs: InstallNeeds
  onDone: () => void
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const { logs, error, clearLogs } = useInstallLogs()
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)

  const runInstall = useCallback(async () => {
    setInstalling(true)
    setFailed(false)
    clearLogs()
    try {
      if (needs.needNode) {
        const r = await window.electronAPI.install.node()
        if (!r.success) throw new Error(r.error)
      }
      if (needs.needOpenclaw) {
        const r = await window.electronAPI.install.openclaw()
        if (!r.success) throw new Error(r.error)
      }
      if (needs.needPython) {
        const r = await window.electronAPI.install.python()
        if (!r.success) throw new Error(r.error)
      }
      setDone(true)
    } catch {
      setFailed(true)
    } finally {
      setInstalling(false)
    }
  }, [needs, clearLogs])

  return (
    <div className="flex flex-1 flex-col justify-center gap-4 px-8">
      <div>
        <h2 className="text-lg font-extrabold">
          {done
            ? t('install.done')
            : failed
              ? t('install.failed')
              : installing
                ? t('install.progress')
                : t('install.ready')}
        </h2>
        <p className="text-xs font-medium text-text-muted">
          {installing
            ? t('install.wait')
            : done
              ? t('install.allReady')
              : failed
                ? t('install.checkLog')
                : t('install.desc')}
        </p>
      </div>

      <div className="space-y-2">
        {(() => {
          const rows: { label: string }[] = []
          if (needs.needNode) rows.push({ label: t('install.nodejs') })
          if (needs.needOpenclaw) rows.push({ label: t('install.openclaw') })
          if (needs.needPython) rows.push({ label: t('install.python') })
          return rows.map((row, i) => (
            <div
              key={`${row.label}-${i}`}
              className="glass-card flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
            >
              <span className="text-primary">{String(i + 1).padStart(2, '0')}</span> {row.label}
            </div>
          ))
        })()}
      </div>

      {(installing || logs.length > 0) && <LogViewer lines={logs} />}
      {error && <p className="text-error text-xs font-medium">{error}</p>}

      <div className="flex gap-3 justify-end mt-1">
        {failed && (
          <Button variant="secondary" size="sm" onClick={runInstall}>
            {t('install.retryBtn')}
          </Button>
        )}
        {!done && !installing && !failed && (
          <Button variant="primary" size="lg" onClick={runInstall}>
            {t('install.startBtn')}
          </Button>
        )}
        {done && (
          <Button variant="primary" size="lg" onClick={onDone}>
            {t('install.nextBtn')}
          </Button>
        )}
      </div>
    </div>
  )
}
