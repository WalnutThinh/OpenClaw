import { useCallback, useEffect, useState } from 'react'

import eclawMarkUrl from './assets/eclaw-mark.png?url'

type Phase = 'idle' | 'installing' | 'done' | 'error'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function App(): React.JSX.Element {
  const [folder, setFolder] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [meta, setMeta] = useState<{
    ready: boolean
    mode: 'local' | 'download' | 'none'
    remoteUrl?: string
    reason?: string
  } | null>(null)
  const [doneExe, setDoneExe] = useState<string | null>(null)
  const [openAppErr, setOpenAppErr] = useState<string | null>(null)
  const [extractCount, setExtractCount] = useState(0)
  const [extractCurrentFile, setExtractCurrentFile] = useState<string | null>(null)
  const [extractNative, setExtractNative] = useState(false)
  const [installSeconds, setInstallSeconds] = useState(0)
  const [installPhase, setInstallPhase] = useState<'download' | 'extract' | null>(null)
  const [dl, setDl] = useState<{ received: number; total?: number }>({ received: 0 })

  useEffect(() => {
    void window.setupAPI.payloadInfo().then(setMeta)
  }, [])

  useEffect(() => {
    if (phase !== 'installing') {
      setExtractCount(0)
      setExtractCurrentFile(null)
      setExtractNative(false)
      setInstallSeconds(0)
      setInstallPhase(null)
      setDl({ received: 0 })
      return
    }
    const unsubEx = window.setupAPI.subscribeExtractProgress((p) => {
      if (p.done) {
        setExtractNative(false)
        setExtractCurrentFile(null)
        setExtractCount(0)
        return
      }
      if (p.native === true) setExtractNative(true)
      if (p.native === false) setExtractNative(false)
      if (typeof p.files === 'number') setExtractCount(p.files)
      if (p.currentFile) setExtractCurrentFile(p.currentFile)
    })
    const unsubDl = window.setupAPI.subscribeDownloadProgress((p) => {
      setDl({ received: p.received, total: p.total })
    })
    const unsubPh = window.setupAPI.subscribeInstallPhase((p) => {
      setInstallPhase(p.phase)
    })
    const t0 = Date.now()
    const tick = setInterval(() => {
      setInstallSeconds(Math.floor((Date.now() - t0) / 1000))
    }, 1000)
    return () => {
      unsubEx()
      unsubDl()
      unsubPh()
      clearInterval(tick)
    }
  }, [phase])

  const close = useCallback(() => {
    void window.setupAPI.closeWindow()
  }, [])

  const pick = useCallback(async () => {
    setErr(null)
    const p = await window.setupAPI.pickFolder()
    setFolder(p)
  }, [])

  const runInstall = useCallback(async () => {
    if (!folder) return
    setPhase('installing')
    setErr(null)
    const r = await window.setupAPI.install(folder)
    if (r.ok) {
      setDoneExe(r.exePath)
      setPhase('done')
    } else {
      setPhase('error')
      setErr(r.error)
    }
  }, [folder])

  const openAppAndClose = useCallback(async () => {
    if (!doneExe) return
    setOpenAppErr(null)
    const errMsg = await window.setupAPI.openAppAndClose(doneExe)
    if (errMsg) setOpenAppErr(errMsg)
  }, [doneExe])

  const progressActive = phase === 'installing'
  const installTimeLabel =
    installSeconds >= 60
      ? `${Math.floor(installSeconds / 60)}m ${installSeconds % 60}s`
      : `${installSeconds}s`

  const headline = (() => {
    if (!progressActive) return ''
    if (installPhase === 'download') return 'Downloading app package…'
    if (installPhase === 'extract') return 'Extracting files…'
    return 'Preparing…'
  })()

  const subline = (() => {
    if (!progressActive) return null
    if (installPhase === 'download') {
      const parts = [`Elapsed ${installTimeLabel}`]
      if (dl.received > 0) {
        parts.push(`downloaded ${fmtBytes(dl.received)}${dl.total ? ` / ${fmtBytes(dl.total)}` : ''}`)
      }
      return parts.join(' · ')
    }
    if (installPhase === 'extract') {
      const parts = [`Elapsed ${installTimeLabel}`]
      if (extractNative) {
        parts.push('fast extract (Windows)')
        return parts.join(' · ')
      }
      if (extractCount > 0) parts.push(`${extractCount.toLocaleString()} items`)
      if (extractCurrentFile) parts.push(`now: ${extractCurrentFile}`)
      return parts.join(' · ')
    }
    return `Elapsed ${installTimeLabel}`
  })()

  const downloadPct =
    installPhase === 'download' && dl.total && dl.total > 0
      ? Math.min(100, Math.round((dl.received / dl.total) * 100))
      : null

  const canInstall = !!folder && !!meta?.ready && phase !== 'installing'

  if (phase === 'done' && doneExe) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f5f3ed',
          color: '#1a1a1a',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <header className="setup-chrome setup-chrome--brand">
          <div className="setup-chrome-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={eclawMarkUrl} alt="" width={18} height={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', userSelect: 'none' }}>EClaw</span>
          </div>
          <button type="button" className="setup-close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 28px 36px',
            textAlign: 'center'
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>Installation Completed</p>
          <button
            type="button"
            onClick={() => void openAppAndClose()}
            style={{
              minWidth: 220,
              maxWidth: 280,
              padding: '14px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(90deg, #e2b8b9 0%, #105a41 100%)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Open App
          </button>
          {openAppErr && (
            <p style={{ color: '#b91c1c', fontSize: 12, marginTop: 14, maxWidth: 360 }}>{openAppErr}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f3ed',
        color: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <header className="setup-chrome setup-chrome--brand">
        <div className="setup-chrome-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={eclawMarkUrl} alt="" width={18} height={18} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', userSelect: 'none' }}>EClaw</span>
        </div>
        <button type="button" className="setup-close" onClick={close} aria-label="Close">
          ×
        </button>
      </header>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 28px 28px',
          textAlign: 'center',
          overflow: 'auto',
          minHeight: 0,
          gap: 0
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: 400,
            gap: 16
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              flexShrink: 0
            }}
          >
            <img src={eclawMarkUrl} alt="" width={64} height={64} style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#0f172a',
                userSelect: 'none'
              }}
            >
              EClaw
            </span>
          </div>

          {progressActive ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, minHeight: 22 }}>{headline}</p>
              {subline && (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#555',
                    margin: 0,
                    maxWidth: 380,
                    lineHeight: 1.45
                  }}
                >
                  {subline}
                </p>
              )}
              <div
                style={{
                  width: '100%',
                  maxWidth: 280,
                  height: 6,
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
              >
                {downloadPct !== null && (
                  <div
                    style={{
                      height: '100%',
                      width: `${downloadPct}%`,
                      borderRadius: 999,
                      background: '#2563eb',
                      transition: 'width 0.2s ease-out'
                    }}
                  />
                )}
                {downloadPct === null && (
                  <div
                    className="setup-progress-indeterminate"
                    style={{
                      height: '100%',
                      width: '38%',
                      borderRadius: 999,
                      background: '#2563eb'
                    }}
                  />
                )}
              </div>
            </>
          ) : null}

          {meta && !meta.ready && meta.reason === 'DEV_NO_ZIP' && (
            <p style={{ color: '#b91c1c', fontSize: 13, maxWidth: 380, margin: 0, textAlign: 'left' }}>
              Development: copy the app zip to <code>setup-bootstrapper/payload/openclaw-app.zip</code> (run{' '}
              <code>npm run build:win-setup</code> once) or set <code>OPENCLAW_APP_ZIP_URL</code>.
            </p>
          )}

          {meta && !meta.ready && meta.reason === 'NO_MANIFEST' && (
            <p style={{ color: '#b91c1c', fontSize: 13, maxWidth: 380, margin: 0, textAlign: 'left' }}>
              Packaged build is missing a valid <code>install-manifest.json</code>. Rebuild with{' '}
              <code>npm run build:win-setup</code>.
            </p>
          )}

          {!progressActive ? (
            <div
              style={{
                width: '100%',
                maxWidth: 268,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                alignSelf: 'center',
                marginTop: 4
              }}
            >
              <button
                type="button"
                onClick={pick}
                disabled={phase === 'installing'}
                style={{
                  width: '100%',
                  minHeight: 46,
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.12)',
                  background: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: phase === 'installing' ? 'not-allowed' : 'pointer'
                }}
              >
                {folder ?? 'Choose folder…'}
              </button>

              <button
                type="button"
                onClick={runInstall}
                disabled={!canInstall}
                style={{
                  width: '100%',
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(90deg, #e2b8b9 0%, #105a41 100%)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: canInstall ? 'pointer' : 'not-allowed',
                  opacity: canInstall ? 1 : 0.5
                }}
              >
                {phase === 'installing' ? 'Installing…' : 'Install'}
              </button>
            </div>
          ) : null}

          {err && (
            <p style={{ color: '#b91c1c', fontSize: 13, margin: 0, maxWidth: 380 }}>{err}</p>
          )}
        </div>
      </div>
    </div>
  )
}
