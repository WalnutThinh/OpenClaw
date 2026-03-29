import { useCallback, useEffect, useState } from 'react'

import openclawDarkUrl from './assets/openclaw-dark.svg?url'
import openclawTextUrl from './assets/openclaw-text.svg?url'
import enchanteDirectionUrl from './assets/enchante-direction-black.svg?url'

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
  const [extractCount, setExtractCount] = useState(0)
  const [installSeconds, setInstallSeconds] = useState(0)
  const [installPhase, setInstallPhase] = useState<'download' | 'extract' | null>(null)
  const [dl, setDl] = useState<{ received: number; total?: number }>({ received: 0 })

  useEffect(() => {
    void window.setupAPI.payloadInfo().then(setMeta)
  }, [])

  useEffect(() => {
    if (phase !== 'installing') {
      setExtractCount(0)
      setInstallSeconds(0)
      setInstallPhase(null)
      setDl({ received: 0 })
      return
    }
    const unsubEx = window.setupAPI.subscribeExtractProgress((p) => {
      setExtractCount(p.files)
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

  const progressActive = phase === 'installing'
  const installTimeLabel =
    installSeconds >= 60
      ? `${Math.floor(installSeconds / 60)}m ${installSeconds % 60}s`
      : `${installSeconds}s`

  const headline = (() => {
    if (!progressActive) return 'Choose a folder, then install.'
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
      if (extractCount > 0) parts.push(`${extractCount.toLocaleString()} items`)
      parts.push('antivirus may slow this step')
      return parts.join(' · ')
    }
    return `Elapsed ${installTimeLabel}`
  })()

  const downloadPct =
    installPhase === 'download' && dl.total && dl.total > 0
      ? Math.min(100, Math.round((dl.received / dl.total) * 100))
      : null

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#f5f3ed',
        color: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <header className="setup-chrome">
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
          padding: '12px 28px 32px',
          textAlign: 'center',
          overflow: 'auto'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
          <img src={openclawDarkUrl} alt="" width={72} height={72} style={{ flexShrink: 0 }} />
          <img
            src={openclawTextUrl}
            alt="OpenClaw"
            style={{ height: 36, width: 'auto', maxWidth: 220, objectFit: 'contain' }}
          />
        </div>

        <h1 style={{ fontSize: 16, fontWeight: 500, color: '#6b6b6b', margin: '0 0 8px' }}>Installing OpenClaw</h1>

        <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 6px', minHeight: 22 }}>{headline}</p>
        {subline && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#555',
              margin: '0 0 10px',
              maxWidth: 420,
              lineHeight: 1.45
            }}
          >
            {subline}
          </p>
        )}

        <div
          style={{
            width: '100%',
            maxWidth: 320,
            height: 6,
            borderRadius: 999,
            background: 'rgba(0,0,0,0.08)',
            overflow: 'hidden',
            marginBottom: 28
          }}
        >
          {progressActive && downloadPct !== null && (
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
          {progressActive && downloadPct === null && (
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#666',
            marginBottom: 24
          }}
        >
          <span>Customized by</span>
          <img src={enchanteDirectionUrl} alt="Enchante" style={{ height: 22, width: 'auto' }} />
        </div>

        {meta?.ready && meta.mode === 'download' && phase === 'idle' && (
          <p style={{ fontSize: 12, color: '#666', maxWidth: 420, marginBottom: 16, lineHeight: 1.45 }}>
            This installer downloads the full OpenClaw package from the network, then extracts it to the folder you
            choose. Ensure you are online. After release, upload the matching <code>OpenClaw-*-win.zip</code> to your
            downloads host (see <code>install-manifest.json</code>).
          </p>
        )}

        {meta && !meta.ready && meta.reason === 'DEV_NO_ZIP' && (
          <p style={{ color: '#b91c1c', fontSize: 13, maxWidth: 400, marginBottom: 16 }}>
            Development: copy the app zip to <code>setup-bootstrapper/payload/openclaw-app.zip</code> (run{' '}
            <code>npm run build:win-setup</code> once) or set <code>OPENCLAW_APP_ZIP_URL</code>.
          </p>
        )}

        {meta && !meta.ready && meta.reason === 'NO_MANIFEST' && (
          <p style={{ color: '#b91c1c', fontSize: 13, maxWidth: 400, marginBottom: 16 }}>
            Packaged build is missing a valid <code>install-manifest.json</code>. Rebuild with{' '}
            <code>npm run build:win-setup</code>.
          </p>
        )}

        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={pick}
            disabled={phase === 'installing'}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              fontSize: 14,
              cursor: phase === 'installing' ? 'not-allowed' : 'pointer'
            }}
          >
            {folder ?? 'Choose folder…'}
          </button>

          <button
            type="button"
            onClick={runInstall}
            disabled={!folder || phase === 'installing' || !meta?.ready}
            style={{
              padding: '14px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(90deg, #e2b8b9 0%, #105a41 100%)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: !folder || phase === 'installing' ? 'not-allowed' : 'pointer',
              opacity: !folder || phase === 'installing' ? 0.5 : 1
            }}
          >
            {phase === 'installing' ? 'Installing…' : 'Install'}
          </button>
        </div>

        {err && (
          <p style={{ color: '#b91c1c', fontSize: 13, marginTop: 16, maxWidth: 420 }}>{err}</p>
        )}

        {phase === 'done' && doneExe && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <p style={{ fontSize: 14, margin: 0 }}>Installation complete.</p>
            <button
              type="button"
              onClick={() => void window.setupAPI.openPath(doneExe)}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.15)',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Open OpenClaw
            </button>
            <button
              type="button"
              onClick={() => void window.setupAPI.reveal(doneExe)}
              style={{
                border: 'none',
                background: 'none',
                color: '#2563eb',
                cursor: 'pointer',
                fontSize: 13,
                textDecoration: 'underline'
              }}
            >
              Show in folder
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
