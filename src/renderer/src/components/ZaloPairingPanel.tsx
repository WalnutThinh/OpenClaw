import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Button from './Button'
import { extractPrimaryZaloPairingCode, extractZaloPairingCodes } from '../utils/extract-zalo-pairing-code'

/**
 * In-app Zalo pairing (no terminal) — used on the Config step when Zalo is enabled.
 */
export default function ZaloPairingPanel({
  disabled = false,
  autoRefreshOnMount = true,
  pollIntervalMs = 0,
  titleOverride
}: {
  /** When true, inputs and actions are inactive (e.g. gateway not running). */
  disabled?: boolean
  autoRefreshOnMount?: boolean
  pollIntervalMs?: number
  /** e.g. Config step label “Authentication” / “Xác thực” instead of “Zalo pairing”. */
  titleOverride?: string
}): React.JSX.Element {
  const { t } = useTranslation('management')
  const [zaloPairCode, setZaloPairCode] = useState('')
  const [zaloListOut, setZaloListOut] = useState('')
  const [zaloPairBusy, setZaloPairBusy] = useState(false)
  const [zaloPairFeedback, setZaloPairFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  )
  const [detectedCopied, setDetectedCopied] = useState(false)

  const detectedCodes = useMemo(() => extractZaloPairingCodes(zaloListOut), [zaloListOut])
  const primaryDetected = useMemo(() => extractPrimaryZaloPairingCode(zaloListOut), [zaloListOut])

  const refreshZaloPairingList = useCallback(async () => {
    setZaloPairBusy(true)
    setZaloPairFeedback(null)
    try {
      const r = await window.electronAPI.pairing.zaloList()
      setZaloListOut(r.output)
      if (!r.ok) {
        setZaloPairFeedback({ kind: 'err', text: t('zaloPairing.failed', { detail: r.output }) })
      }
    } catch (e) {
      setZaloPairFeedback({
        kind: 'err',
        text: t('zaloPairing.failed', { detail: e instanceof Error ? e.message : String(e) })
      })
    } finally {
      setZaloPairBusy(false)
    }
  }, [t])

  const submitZaloPairing = useCallback(async () => {
    setZaloPairBusy(true)
    setZaloPairFeedback(null)
    try {
      const r = await window.electronAPI.pairing.zaloApprove(zaloPairCode.trim())
      if (r.output === 'invalid_code') {
        setZaloPairFeedback({ kind: 'err', text: t('zaloPairing.invalidCode') })
        return
      }
      if (r.ok) {
        setZaloPairFeedback({ kind: 'ok', text: t('zaloPairing.approved') })
        setZaloPairCode('')
        await refreshZaloPairingList()
      } else {
        setZaloPairFeedback({ kind: 'err', text: t('zaloPairing.failed', { detail: r.output }) })
      }
    } catch (e) {
      setZaloPairFeedback({
        kind: 'err',
        text: t('zaloPairing.failed', { detail: e instanceof Error ? e.message : String(e) })
      })
    } finally {
      setZaloPairBusy(false)
    }
  }, [zaloPairCode, t, refreshZaloPairingList])

  useEffect(() => {
    if (disabled || !autoRefreshOnMount) return
    void refreshZaloPairingList()
  }, [disabled, autoRefreshOnMount, refreshZaloPairingList])

  useEffect(() => {
    if (disabled || pollIntervalMs <= 0) return
    const id = window.setInterval(() => void refreshZaloPairingList(), pollIntervalMs)
    return () => window.clearInterval(id)
  }, [disabled, pollIntervalMs, refreshZaloPairingList])

  /** Suggest code from CLI/list output when the field is still empty. */
  useEffect(() => {
    if (zaloPairCode.trim().length >= 4) return
    const p = primaryDetected
    if (p) setZaloPairCode(p)
  }, [zaloListOut, zaloPairCode, primaryDetected])

  return (
    <div className="w-full max-w-sm glass-card rounded-xl p-3 space-y-2 text-left">
      <p className="text-[11px] font-bold text-primary">{titleOverride ?? t('zaloPairing.title')}</p>
      <p className="text-[10px] text-text-muted/90 leading-snug">{t('zaloPairing.intro')}</p>
      <p className="text-[9px] text-text-muted/75 leading-snug border-l-2 border-primary/30 pl-2">
        {t('zaloPairing.optionalNote')}
      </p>
      {primaryDetected && !disabled ? (
        <div className="rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-2 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-primary/90">
            {t('zaloPairing.detectedLabel')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-[13px] font-bold tracking-wider text-text">{primaryDetected}</code>
            <Button
              variant="secondary"
              size="sm"
              disabled={zaloPairBusy}
              onClick={() => {
                void navigator.clipboard.writeText(primaryDetected).then(() => {
                  setDetectedCopied(true)
                  window.setTimeout(() => setDetectedCopied(false), 2000)
                })
              }}
            >
              {detectedCopied ? t('zaloPairing.copied') : t('zaloPairing.copy')}
            </Button>
          </div>
          {detectedCodes.length > 1 ? (
            <p className="text-[9px] text-text-muted/80">{t('zaloPairing.multipleCodes', { count: detectedCodes.length })}</p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-1">
        <label
          htmlFor="zalo-pairing-code-input"
          className="block text-[10px] font-bold text-text/90 leading-snug"
        >
          {t('zaloPairing.codeLabel')}
        </label>
        <p className="text-[9px] text-text-muted/75 leading-snug">{t('zaloPairing.codeHint')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="zalo-pairing-code-input"
          type="text"
          autoComplete="off"
          className="min-w-[160px] flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-text placeholder:text-text-muted/40"
          value={zaloPairCode}
          onChange={(e) => setZaloPairCode(e.target.value)}
          placeholder={t('zaloPairing.codePlaceholder')}
          disabled={zaloPairBusy || disabled}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={zaloPairBusy || disabled || zaloPairCode.trim().length < 4}
          onClick={() => void submitZaloPairing()}
        >
          {zaloPairBusy ? t('zaloPairing.busy') : t('zaloPairing.approveBtn')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={zaloPairBusy || disabled}
          onClick={() => void refreshZaloPairingList()}
        >
          {t('zaloPairing.listBtn')}
        </Button>
      </div>
      {zaloListOut ? (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted/70">{t('zaloPairing.listHint')}</p>
          <pre className="max-h-28 overflow-auto rounded-lg bg-black/25 p-2 font-mono text-[9px] leading-relaxed text-text-muted">
            {zaloListOut}
          </pre>
        </div>
      ) : null}
      {zaloPairFeedback ? (
        <p
          className={`text-[10px] font-medium ${
            zaloPairFeedback.kind === 'ok' ? 'text-[var(--color-success)]' : 'text-error'
          }`}
        >
          {zaloPairFeedback.text}
        </p>
      ) : null}
    </div>
  )
}
