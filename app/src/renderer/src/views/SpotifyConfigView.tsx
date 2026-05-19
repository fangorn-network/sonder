import { useState } from 'react'
import type { SpotifyConfig } from '../hooks/useSpotifyConfig'

interface SpotifyConfigViewProps {
  initial?: SpotifyConfig | null
  onSave: (config: SpotifyConfig) => void
  onBack?: () => void
}

export function SpotifyConfigView({ initial, onSave, onBack }: SpotifyConfigViewProps) {
  const [clientId, setClientId] = useState(initial?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState(initial?.clientSecret ?? '')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    if (!id || !secret) {
      setError('Both fields are required.')
      return
    }
    setError(null)
    onSave({ clientId: id, clientSecret: secret })
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '480px',
        background: 'var(--glass-2)',
        backdropFilter: 'var(--blur-md)',
        WebkitBackdropFilter: 'var(--blur-md)',
        border: '1px solid var(--glass-edge)',
        boxShadow: 'inset 0 1px 0 var(--glass-edge-top)',
        borderRadius: 'var(--r-lg)',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
      }}>

        {/* ── header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--fg3)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                padding: '0',
                transition: 'color var(--t1)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg3)')}
            >
              ← back
            </button>
          )}
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '32px',
            letterSpacing: '0.04em',
            color: 'var(--fg)',
            lineHeight: 1,
          }}>
            SPOTIFY CONNECT
          </span>
        </div>

        {/* ── description ── */}
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          fontWeight: 300,
          color: 'var(--fg3)',
          lineHeight: 1.7,
          margin: '0 0 24px',
        }}>
          SOND3R uses your own Spotify app credentials so your account is never subject to API quota limits.{' '}
          <a
            href="https://developer.spotify.com/dashboard/create"
            rel="noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            Create an app ↗
          </a>{' '}
          with redirect URI{' '}
          <code style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--r-sm)',
            padding: '1px 6px',
            color: 'var(--accent)',
          }}>
            http://127.0.0.1:5173/callback
          </code>
          , then paste the credentials below. All data is stored locally.
        </p>

        {/* ── client id field ── */}
        <div className="studio-field" style={{ borderTop: '1px solid var(--glass-edge)' }}>
          <label className="studio-label">
            Client ID <span className="studio-required">*</span>
          </label>
          <input
            className="studio-input"
            type="text"
            placeholder="a1b2c3d4e5f6..."
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.04em' }}
          />
        </div>

        {/* ── client secret field ── */}
        <div className="studio-field" style={{ marginBottom: '20px' }}>
          <label className="studio-label">
            Client Secret <span className="studio-required">*</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              className="studio-input"
              type={showSecret ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.04em', flex: 1 }}
            />
            <button
              onClick={() => setShowSecret(v => !v)}
              tabIndex={-1}
              className="btn-ghost"
              style={{ flexShrink: 0, padding: '4px 10px', fontSize: '10px' }}
            >
              {showSecret ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {/* ── error ── */}
        {error && (
          <div className="upload-error" style={{ marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {/* ── save button ── */}
        <button className="studio-submit" onClick={handleSubmit}>
          save & connect
        </button>

      </div>
    </div>
  )
}