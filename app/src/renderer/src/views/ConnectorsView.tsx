/**
 * ConnectorsView.tsx
 *
 * Renders inline inside <main> — no fixed overlay, no separate topbar.
 * Navigation handled by the app header; this view fills the content area.
 *
 * ─── Electron wiring ─────────────────────────────────────────────────────────
 *
 * main.ts: ipcMain.handle('spotify:oauth', ...) opens a BrowserWindow,
 * watches will-redirect for http://localhost:8080/callback, destroys the
 * window, resolves with the full callback URL.
 *
 * No custom preload entry needed — uses window.electron.ipcRenderer.invoke
 * (standard electron-toolkit contextBridge shape) throughout.
 *
 * ─── Storage ─────────────────────────────────────────────────────────────────
 *
 * localStorage for now. Upgrade path: route through Electron safeStorage via
 * ipcRenderer.invoke('secrets:set' | 'secrets:get' | 'secrets:delete').
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

interface SpotifyCredentials {
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface PinataConfig {
  jwt: string
  gateway: string
}

type ConnectorId = 'spotify' | 'pinata'

// ─── Storage keys ─────────────────────────────────────────────────────────────

const SK = {
  SPOTIFY_CREDS: 'sond3r:spotify:credentials',
  SPOTIFY_TOKENS: 'sond3r:spotify:tokens',
  PINATA_CONFIG: 'sond3r:pinata:config',
} as const

// ─── PKCE helpers (Web Crypto API, zero deps) ─────────────────────────────────

function b64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
async function makeVerifier(): Promise<string> {
  const a = new Uint8Array(32); crypto.getRandomValues(a); return b64url(a)
}
async function makeChallenge(v: string): Promise<string> {
  return b64url(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  ))
}
function makeState(): string {
  const a = new Uint8Array(16); crypto.getRandomValues(a); return b64url(a)
}

// ─── Spotify constants ────────────────────────────────────────────────────────

const DEFAULT_REDIRECT_URI = 'http://localhost:8080/callback'

const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
].join(' ')

// ─── Sidebar meta ─────────────────────────────────────────────────────────────

const CONNECTOR_META: Record<ConnectorId, { label: string; hint: string }> = {
  spotify: { label: 'Spotify', hint: 'playback' },
  pinata: { label: 'Pinata', hint: 'storage' },
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface ConnectorsViewProps {
  onSpotifyConfigSaved?: (config: SpotifyCredentials) => void
}

export function ConnectorsView({ onSpotifyConfigSaved }: ConnectorsViewProps) {
  const [active, setActive] = useState<ConnectorId>('spotify')

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, margin: '0 calc(-1 * var(--sp-5))' }}>

      {/* ── sidebar ─────────────────────────────────────────────────────────── */}
      <nav style={{
        width: 'var(--nav-width, 160px)',
        height: '100vh',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'var(--sp-2)',
        borderRight: '1px solid var(--glass-edge)',
        background: 'var(--glass-1)',
        backdropFilter: 'var(--blur-md)',
        WebkitBackdropFilter: 'var(--blur-md)',
      }}>
        <span className="nav-section-label">Connectors</span>

        {(Object.keys(CONNECTOR_META) as ConnectorId[]).map(id => {
          const { label, hint } = CONNECTOR_META[id]
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`nav-btn${active === id ? ' active' : ''}`}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                <span>{label}</span>
                <span style={{
                  fontSize: 9, letterSpacing: '0.1em', fontWeight: 400,
                  textTransform: 'lowercase', opacity: 0.5,
                }}>{hint}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {/* ── panel content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-6)' }}>
        {active === 'spotify' && <SpotifyPanel onConfigSaved={onSpotifyConfigSaved} />}
        {active === 'pinata' && <PinataPanel />}
      </div>

    </div>
  )
}

// ─── Spotify panel ────────────────────────────────────────────────────────────

function SpotifyPanel({ onConfigSaved }: { onConfigSaved?: (cfg: SpotifyCredentials) => void }) {
  const [creds, setCreds] = useState<SpotifyCredentials | null>(() => safeGet(SK.SPOTIFY_CREDS))
  const [tokens, setTokens] = useState<SpotifyTokens | null>(() => safeGet(SK.SPOTIFY_TOKENS))

  const [clientId, setClientId] = useState(creds?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState(creds?.clientSecret ?? '')
  const [redirectUri, setRedirectUri] = useState(creds?.redirectUri ?? DEFAULT_REDIRECT_URI)
  const [showSecret, setShowSecret] = useState(false)
  const [credsOpen, setCredsOpen] = useState(!creds)
  const [oauthPhase, setOauthPhase] = useState<'idle' | 'pending' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // ── Token refresh ──────────────────────────────────────────────────────────

  const doRefresh = useCallback(async (
    c: SpotifyCredentials, refreshToken: string,
  ): Promise<SpotifyTokens> => {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${c.clientId}:${c.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: refreshToken, client_id: c.clientId,
      }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error_description ?? `Refresh failed (${res.status})`)
    }
    const data = await res.json()
    const next: SpotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope ?? '',
    }
    safeSave(SK.SPOTIFY_TOKENS, next)
    setTokens(next)
    return next
  }, [])

  // Auto-refresh 60s before expiry
  useEffect(() => {
    if (!tokens || !creds) return
    const lag = tokens.expiresAt - Date.now() - 60_000
    if (lag <= 0) { doRefresh(creds, tokens.refreshToken).catch(console.error); return }
    const t = setTimeout(() => doRefresh(creds, tokens.refreshToken).catch(console.error), lag)
    return () => clearTimeout(t)
  }, [tokens, creds, doRefresh])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const saveCreds = () => {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    const redir = redirectUri.trim() || DEFAULT_REDIRECT_URI
    if (!id || !secret) { setError('Both fields are required.'); return }
    const next = { clientId: id, clientSecret: secret, redirectUri: redir }
    safeSave(SK.SPOTIFY_CREDS, next)
    setCreds(next)
    setCredsOpen(false)
    setError(null)
    onConfigSaved?.(next)
  }

  const startOAuth = async () => {
    if (!creds) { setError('Save your app credentials first.'); return }
    setError(null)
    setOauthPhase('pending')

    const verifier = await makeVerifier()
    const challenge = await makeChallenge(verifier)
    const state = makeState()
    const redir = creds.redirectUri || DEFAULT_REDIRECT_URI

    const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: creds.clientId, response_type: 'code', redirect_uri: redir,
      state, scope: SPOTIFY_SCOPES, code_challenge_method: 'S256', code_challenge: challenge,
    })

    try {
      const callbackUrl: string = await (window as any).electron.ipcRenderer.invoke(
        'spotify:oauth', authUrl, redir,
      )
      const url = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      const err = url.searchParams.get('error')

      if (err) throw new Error(`Spotify denied: ${err}`)
      if (url.searchParams.get('state') !== state) throw new Error('State mismatch — possible CSRF')
      if (!code) throw new Error('No authorization code received')

      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code,
          redirect_uri: redir, client_id: creds.clientId, code_verifier: verifier,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error_description ?? `Token exchange failed (${res.status})`)
      }
      const data = await res.json()
      const next: SpotifyTokens = {
        accessToken: data.access_token, refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000, scope: data.scope ?? '',
      }
      safeSave(SK.SPOTIFY_TOKENS, next)
      setTokens(next)
      setOauthPhase('idle')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'OAuth failed'
      if (msg !== 'auth_cancelled') setError(msg)
      setOauthPhase('error')
    }
  }

  const disconnect = () => {
    localStorage.removeItem(SK.SPOTIFY_TOKENS)
    setTokens(null); setOauthPhase('idle'); setError(null)
  }

  const isExpired = !!tokens && tokens.expiresAt < Date.now()
  const isActive = !!tokens && !isExpired

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 540 }}>

      <PanelHeading title="SPOTIFY" sub="music playback + library access" />

      {/* App credentials — accordion */}
      <div className="studio-section" style={{ marginBottom: 'var(--sp-4)' }}>
        <button
          onClick={() => setCredsOpen(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span className="studio-section-label" style={{ padding: 'var(--sp-3) var(--sp-4)', border: 'none', background: 'none', flex: 1, textAlign: 'left' }}>
            App Credentials
          </span>
          <span style={{ paddingRight: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {creds && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em' }}>✓ SAVED</span>}
            <span style={{
              display: 'inline-block', fontSize: 10, color: 'var(--fg4)',
              transform: credsOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--t1)',
            }}>▾</span>
          </span>
        </button>

        {credsOpen && (
          <>
            <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid var(--glass-edge)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300, color: 'var(--fg3)', lineHeight: 1.7, marginBottom: 'var(--sp-4)' }}>
                Create an app at{' '}
                <a href="https://developer.spotify.com/dashboard/create" rel="noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  developer.spotify.com ↗
                </a>
                {' '}and register your redirect URI below as an allowed redirect URI in the Spotify dashboard.
              </p>

              <div className="studio-field">
                <label className="studio-label">
                  Redirect URI <span className="studio-required">*</span>
                </label>
                <input
                  className="studio-input"
                  type="text"
                  placeholder={DEFAULT_REDIRECT_URI}
                  value={redirectUri}
                  onChange={e => setRedirectUri(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </div>

              <div className="studio-field">
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
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
                />
              </div>

              <div className="studio-field" style={{ borderBottom: 'none' }}>
                <label className="studio-label">
                  Client Secret <span className="studio-required">*</span>
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="studio-input"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="••••••••••••••••••••••••••••••••"
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 13, flex: 1 }}
                  />
                  <button
                    onClick={() => setShowSecret(v => !v)}
                    tabIndex={-1}
                    className="btn-ghost"
                    style={{ flexShrink: 0, padding: '4px 10px', fontSize: 10 }}
                  >
                    {showSecret ? 'hide' : 'show'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--glass-edge)' }}>
              <button className="studio-submit" onClick={saveCreds}>
                save credentials
              </button>
            </div>
          </>
        )}
      </div>

      {/* Account / OAuth status */}
      <div className="studio-section" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="studio-section-label" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--sp-3) var(--sp-4)',
        }}>
          <span>Account</span>
          <ConnectionDot active={isActive} pending={oauthPhase === 'pending'} expired={isExpired} />
        </div>

        <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid var(--glass-edge)' }}>
          {isActive ? (
            <>
              {/* Token stats */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 1, background: 'var(--glass-edge)',
                border: '1px solid var(--glass-edge)', borderRadius: 'var(--r-sm)',
                overflow: 'hidden', marginBottom: 'var(--sp-4)',
              }}>
                <StatCell label="Expires" value={new Date(tokens!.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                <StatCell label="Scopes" value={`${tokens!.scope.split(' ').length} granted`} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-ghost"
                  onClick={() => creds && doRefresh(creds, tokens!.refreshToken).catch(e => setError(String(e)))}
                >
                  refresh now
                </button>
                <button className="btn-ghost" onClick={disconnect} style={{ color: 'var(--err)' }}>
                  disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              {isExpired && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--err)', marginBottom: 'var(--sp-3)', letterSpacing: '0.04em' }}>
                  Session expired — re-authorize to continue.
                </p>
              )}
              {oauthPhase === 'pending' && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg3)', marginBottom: 'var(--sp-3)', letterSpacing: '0.04em' }}>
                  Authorization window open…
                </p>
              )}
              <button
                className="studio-submit"
                onClick={oauthPhase === 'pending' ? undefined : startOAuth}
                disabled={!creds || oauthPhase === 'pending'}
                style={{ opacity: (!creds || oauthPhase === 'pending') ? 0.35 : 1 }}
              >
                {oauthPhase === 'pending' ? 'waiting for callback…' : 'connect with spotify'}
              </button>
              {!creds && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)', marginTop: 8, fontWeight: 300 }}>
                  Save your app credentials above first.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div className="upload-error">{error}</div>}
    </div>
  )
}

// ─── Pinata panel ─────────────────────────────────────────────────────────────

function PinataPanel() {
  const [config, setConfig] = useState<PinataConfig | null>(() => safeGet(SK.PINATA_CONFIG))

  const [jwt, setJwt] = useState(config?.jwt ?? '')
  const [gateway, setGateway] = useState(config?.gateway ?? '')
  const [showJwt, setShowJwt] = useState(false)
  const [testPhase, setTestPhase] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const j = jwt.trim(); const g = gateway.trim()
    if (!j) { setError('JWT is required.'); return }
    if (!j.startsWith('eyJ')) { setError('JWT looks malformed.'); return }
    if (!g) { setError('Gateway URL is required.'); return }
    if (!g.startsWith('https')) { setError('Gateway must be HTTPS.'); return }
    const next = { jwt: j, gateway: g.replace(/\/$/, '') }
    safeSave(SK.PINATA_CONFIG, next)
    // we need to dispatch the event since we are in electron and don't have same-window reactivity
    window.dispatchEvent(new StorageEvent('storage', { 
      key: 'sond3r:pinata:config', 
      newValue: JSON.stringify(next) 
    }))
    setConfig(next); setError(null); setTestPhase('idle')
  }

  const testAuth = async () => {
    const j = jwt.trim()
    if (!j) { setError('Enter a JWT to test.'); return }
    setTestPhase('testing'); setError(null)
    try {
      const res = await fetch('https://api.pinata.cloud/data/testAuthentication', {
        headers: { Authorization: `Bearer ${j}` },
      })
      if (!res.ok) throw new Error(`Authentication rejected (${res.status})`)
      setTestPhase('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed')
      setTestPhase('fail')
    }
  }

  const disconnect = () => {
    localStorage.removeItem(SK.PINATA_CONFIG)
    setConfig(null); setJwt(''); setGateway(''); setTestPhase('idle'); setError(null)
  }

  const testLabel =
    testPhase === 'testing' ? 'testing…' :
      testPhase === 'ok' ? '✓ authenticated' :
        testPhase === 'fail' ? '✗ failed' : 'test connection'

  const testAccent =
    testPhase === 'ok' ? { color: 'var(--success)' } :
      testPhase === 'fail' ? { color: 'var(--err)' } : {}

  return (
    <div style={{ maxWidth: 540 }}>

      <PanelHeading title="PINATA" sub="IPFS storage gateway" />

      <div className="studio-section" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="studio-section-label" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--sp-3) var(--sp-4)',
        }}>
          <span>Credentials</span>
          {config && <ConnectionDot active label="saved" />}
        </div>

        <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid var(--glass-edge)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300, color: 'var(--fg3)', lineHeight: 1.7, marginBottom: 'var(--sp-4)' }}>
            Generate a key at{' '}
            <a href="https://app.pinata.cloud/keys" rel="noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              app.pinata.cloud/keys ↗
            </a>
            {' '}with <InlineCode>pinFileToIPFS</InlineCode> + <InlineCode>pinList</InlineCode> permissions.
          </p>

          <div className="studio-field">
            <label className="studio-label">JWT <span className="studio-required">*</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="studio-input"
                type={showJwt ? 'text' : 'password'}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={jwt}
                onChange={e => setJwt(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, flex: 1 }}
              />
              <button
                onClick={() => setShowJwt(v => !v)}
                tabIndex={-1}
                className="btn-ghost"
                style={{ flexShrink: 0, padding: '4px 10px', fontSize: 10 }}
              >
                {showJwt ? 'hide' : 'show'}
              </button>
            </div>
          </div>

          <div className="studio-field" style={{ borderBottom: 'none' }}>
            <label className="studio-label">Gateway URL <span className="studio-required">*</span></label>
            <input
              className="studio-input"
              type="text"
              placeholder="https://your-name.mypinata.cloud"
              value={gateway}
              onChange={e => setGateway(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{
          padding: 'var(--sp-3) var(--sp-4)',
          borderTop: '1px solid var(--glass-edge)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button
            className="btn-ghost"
            onClick={testAuth}
            disabled={testPhase === 'testing'}
            style={{ opacity: testPhase === 'testing' ? 0.5 : 1, ...testAccent }}
          >
            {testLabel}
          </button>
          <button className="studio-submit" style={{ flex: 1 }} onClick={save}>
            save
          </button>
          {config && (
            <button className="btn-ghost" onClick={disconnect} style={{ color: 'var(--err)', flexShrink: 0 }}>
              clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="upload-error">{error}</div>}
    </div>
  )
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function PanelHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 'var(--sp-6)' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 52,
        letterSpacing: '0.03em',
        lineHeight: 1,
        color: 'var(--fg)',
        margin: 0,
      }}>
        {title}
      </h1>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--fg3)',
        margin: '6px 0 0',
      }}>
        {sub}
      </p>
    </div>
  )
}

function ConnectionDot({ active, pending, expired, label }: {
  active: boolean; pending?: boolean; expired?: boolean; label?: string
}) {
  const color =
    pending ? 'var(--fg3)' :
      expired ? 'var(--err)' :
        active ? 'var(--success)' : 'var(--fg4)'

  const text = label ??
    (pending ? 'pending…' : expired ? 'expired' : active ? 'connected' : 'not connected')

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: active && !expired && !pending ? `0 0 6px ${color}` : 'none',
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color,
      }}>
        {text}
      </span>
    </span>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--glass-1)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg2)' }}>
        {value}
      </div>
    </div>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      background: 'var(--accent-dim)',
      border: '1px solid var(--accent-border)',
      borderRadius: 'var(--r-sm)',
      padding: '1px 6px',
      color: 'var(--accent)',
    }}>
      {children}
    </code>
  )
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function safeGet<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : null }
  catch { return null }
}

function safeSave(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch (e) { console.error('[ConnectorsView] storage write failed:', e) }
}