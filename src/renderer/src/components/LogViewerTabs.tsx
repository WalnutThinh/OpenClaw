import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type LogTabId = 'openclaw' | 'channels'

type Props = {
  openclawLines: string[]
  channelLines: string[]
  /** Controlled tab (e.g. for copy). If omitted, internal state is used. */
  activeTab?: LogTabId
  onTabChange?: (tab: LogTabId) => void
  /** Tailwind height classes for the scrollable log area (default compact). */
  logPaneClassName?: string
}

const MAX_LINES = 500

function LogPane({
  lines,
  emptyLabel,
  logPaneClassName
}: {
  lines: string[]
  emptyLabel: string
  logPaneClassName: string
}): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  const displayLines = lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayLines.length])

  return (
    <div
      className={`p-3 overflow-y-auto font-mono text-[11px] leading-5 text-text-muted ${logPaneClassName}`}
    >
      {displayLines.length === 0 && (
        <span className="opacity-40 italic">{emptyLabel}</span>
      )}
      {displayLines.map((line, i) => (
        <div key={i} className="break-all hover:text-text/80 transition-colors">
          <span className="text-primary/30 mr-2 select-none">&gt;</span>
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

export default function LogViewerTabs({
  openclawLines,
  channelLines,
  activeTab: activeTabControlled,
  onTabChange,
  logPaneClassName = 'h-36'
}: Props): React.JSX.Element {
  const { t } = useTranslation('management')
  const [internalTab, setInternalTab] = useState<LogTabId>('openclaw')
  const isControlled = activeTabControlled !== undefined
  const activeTab = isControlled ? activeTabControlled : internalTab

  const setTab = (tab: LogTabId): void => {
    if (onTabChange) onTabChange(tab)
    if (!isControlled) setInternalTab(tab)
  }

  return (
    <div className="glass-card !rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-error/60" />
        <div className="w-2 h-2 rounded-full bg-warning/60" />
        <div className="w-2 h-2 rounded-full bg-success/60" />
        <span className="ml-2 text-[10px] text-text-muted/50 font-mono">output</span>
      </div>

      <div className="flex border-b border-white/5 px-1 pt-1 gap-0.5">
        <button
          type="button"
          onClick={() => setTab('openclaw')}
          className={`px-2.5 py-1.5 text-[10px] font-bold rounded-t-md transition-colors ${
            activeTab === 'openclaw'
              ? 'bg-white/10 text-text'
              : 'text-text-muted/60 hover:text-text-muted'
          }`}
        >
          {t('logViewer.tabOpenclaw')}
          {openclawLines.length > 0 && (
            <span className="ml-1 opacity-50">({openclawLines.length})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('channels')}
          className={`px-2.5 py-1.5 text-[10px] font-bold rounded-t-md transition-colors ${
            activeTab === 'channels'
              ? 'bg-white/10 text-text'
              : 'text-text-muted/60 hover:text-text-muted'
          }`}
        >
          {t('logViewer.tabChannels')}
          {channelLines.length > 0 && (
            <span className="ml-1 opacity-50">({channelLines.length})</span>
          )}
        </button>
      </div>

      {activeTab === 'openclaw' ? (
        <LogPane
          lines={openclawLines}
          emptyLabel={t('logViewer.waitingOpenclaw')}
          logPaneClassName={logPaneClassName}
        />
      ) : (
        <LogPane
          lines={channelLines}
          emptyLabel={t('logViewer.waitingChannels')}
          logPaneClassName={logPaneClassName}
        />
      )}
    </div>
  )
}
