import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useWalletClient } from 'wagmi'
import { createFangornMiddleware } from '@x402f/fetch'
import { FangornConfig } from '@fangorn-network/sdk'
import './App.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Track {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  price: string
  genre: string
  owner: string
  datasourceName: string
  tag: string
  art: string | null
}

type FangornMiddleware = Awaited<ReturnType<typeof createFangornMiddleware>>

type PlayState = 'idle' | 'loading' | 'playing' | 'error'

type UploadStatus = 'uploading' | 'done' | null

type ViewName = 'Browse' | 'Library' | 'Upload'

interface UploadForm {
  title: string
  artist: string
  album: string
  price: string
  genre: string
}

// CSS custom property helper for hue-based track art colours
interface HueStyle extends CSSProperties {
  '--hue': number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const FANGORN_CONFIG = {
  pinataJwt: import.meta.env.VITE_PINATA_JWT as string,
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY as string,
}

const CHAIN_CONFIG = FangornConfig.ArbitrumSepolia

// ─── Middleware hook ───────────────────────────────────────────────────────────

function useFangornMiddleware(): { middleware: FangornMiddleware | null; loading: boolean } {
  const { wallets } = useWallets()
  const [middleware, setMiddleware] = useState<FangornMiddleware | null>(null)
  const [loading, setLoading] = useState(false)

  // Use the first available wallet (embedded Privy wallet or injected)
  const wallet = wallets[0]

  useEffect(() => {
    if (!wallet) { setMiddleware(null); return }
    setLoading(true)

    wallet.getEthereumProvider()
      .then(async (provider) => {
        // Privy's EIP-1193 provider → viem wallet client
        const { createWalletClient, custom } = await import('viem')
        const walletClient = createWalletClient({
          account: wallet.address as `0x${string}`,
          chain: CHAIN_CONFIG.chain,
          transport: custom(provider),
        })
        return createFangornMiddleware(
          walletClient,
          CHAIN_CONFIG,
          window.location.host,
          FANGORN_CONFIG.pinataJwt,
          FANGORN_CONFIG.pinataGateway
        )
      })
      .then(setMiddleware)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [wallet?.address])

  return { middleware, loading }
}

// ─── Mock data (replace with real index/API) ──────────────────────────────────

const MOCK_TRACKS: Track[] = [
  {
    id: '1',
    title: 'Lagos at 3am',
    artist: 'Tunde Okafor',
    album: 'Neon Harmattan',
    duration: '4:12',
    price: '0.50',
    genre: 'Afrobeats',
    owner: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6',
    datasourceName: 'neon-harmattan',
    tag: 'lagos-3am.mp3',
    art: null,
  },
  {
    id: '2',
    title: 'Monsoon Circuit',
    artist: 'Priya Mehta',
    album: 'Circuit Breaker',
    duration: '3:44',
    price: '0.50',
    genre: 'Indie Electronic',
    owner: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6',
    datasourceName: 'circuit-breaker',
    tag: 'monsoon-circuit.mp3',
    art: null,
  },
  {
    id: '3',
    title: 'Amapiano for the Ancestors',
    artist: 'Zola Dlamini',
    album: 'Dust & Bass',
    duration: '6:01',
    price: '0.75',
    genre: 'Amapiano',
    owner: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6',
    datasourceName: 'dust-and-bass',
    tag: 'amapiano-ancestors.mp3',
    art: null,
  },
  {
    id: '4',
    title: 'Nairobi Dusk',
    artist: 'Wanjiku Sound',
    album: 'Eastlands EP',
    duration: '5:22',
    price: '0.50',
    genre: 'Gengetone',
    owner: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6',
    datasourceName: 'eastlands-ep',
    tag: 'nairobi-dusk.mp3',
    art: null,
  },
]

// ─── ConnectWallet ─────────────────────────────────────────────────────────────

function ConnectWallet() {
  const { login, logout, authenticated, user } = usePrivy()

  if (authenticated) {
    const label =
      user?.email?.address ??
      (user as any)?.google?.email ??
      `${user?.wallet?.address?.slice(0, 6)}...${user?.wallet?.address?.slice(-4)}`
    return (
      <div className="wallet-chip connected">
        <span className="wallet-dot" />
        <span className="wallet-label">{label}</span>
        <button className="wallet-logout" onClick={logout}>✕</button>
      </div>
    )
  }

  return (
    <button className="btn-connect" onClick={login}>
      Connect
    </button>
  )
}

// ─── TrackCard ─────────────────────────────────────────────────────────────────

interface TrackCardProps {
  track: Track
  onPlay: (track: Track) => void
  isPlaying: boolean
}

function TrackCard({ track, onPlay, isPlaying }: TrackCardProps) {
  const initials = track.artist.split(' ').map((w: string) => w[0]).join('').slice(0, 2)
  const hue = (parseInt(track.id) * 67 + 180) % 360

  return (
    <div className={`track-card ${isPlaying ? 'is-playing' : ''}`}>
      <div className="track-art" style={{ '--hue': hue } as HueStyle}>
        <span className="track-initials">{initials}</span>
        {isPlaying && (
          <div className="eq-bars">
            <span /><span /><span /><span />
          </div>
        )}
      </div>
      <div className="track-info">
        <div className="track-title">{track.title}</div>
        <div className="track-artist">{track.artist}</div>
        <div className="track-meta">
          <span className="track-genre">{track.genre}</span>
          <span className="track-duration">{track.duration}</span>
        </div>
      </div>
      <div className="track-action">
        <div className="track-price">${track.price}</div>
        <button
          className={`btn-play ${isPlaying ? 'active' : ''}`}
          onClick={() => onPlay(track)}
          title={isPlaying ? 'Now playing' : `Pay $${track.price} to play`}
        >
          {isPlaying ? '▐▐' : '▶'}
        </button>
      </div>
    </div>
  )
}

// ─── BrowseView ────────────────────────────────────────────────────────────────

interface BrowseViewProps {
  onPlay: (track: Track) => void
  currentTrack: Track | null
}

function BrowseView({ onPlay, currentTrack }: BrowseViewProps) {
  const [filter, setFilter] = useState<string>('All')
  const genres = ['All', 'Afrobeats', 'Amapiano', 'Gengetone', 'Indie Electronic']

  const tracks = filter === 'All'
    ? MOCK_TRACKS
    : MOCK_TRACKS.filter((t: Track) => t.genre === filter)

  return (
    <div className="view browse-view">
      <div className="view-header">
        <h2 className="view-title">Discover</h2>
        <div className="filter-row">
          {genres.map(g => (
            <button
              key={g}
              className={`filter-pill ${filter === g ? 'active' : ''}`}
              onClick={() => setFilter(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="track-list">
        {tracks.map((track: Track) => (
          <TrackCard
            key={track.id}
            track={track}
            onPlay={onPlay}
            isPlaying={currentTrack?.id === track.id}
          />
        ))}
      </div>
    </div>
  )
}

// ─── LibraryView ───────────────────────────────────────────────────────────────

interface LibraryViewProps {
  onPlay: (track: Track) => void
  currentTrack: Track | null
}

function LibraryView({ onPlay, currentTrack }: LibraryViewProps) {
  const { authenticated } = usePrivy()

  if (!authenticated) {
    return (
      <div className="view library-view">
        <div className="empty-state">
          <div className="empty-icon">🔒</div>
          <p>Connect to see your library</p>
        </div>
      </div>
    )
  }

  // TODO: derive from on-chain payment history
  const owned: Track[] = []

  return (
    <div className="view library-view">
      <div className="view-header">
        <h2 className="view-title">Your Library</h2>
      </div>
      {owned.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎵</div>
          <p>No tracks yet — pay to play, and they'll appear here.</p>
        </div>
      ) : (
        <div className="track-list">
          {owned.map((track: Track) => (
            <TrackCard
              key={track.id}
              track={track}
              onPlay={onPlay}
              isPlaying={currentTrack?.id === track.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── UploadView ────────────────────────────────────────────────────────────────

function UploadView() {
  const { authenticated, login } = usePrivy()
  const [form, setForm] = useState<UploadForm>({
    title: '', artist: '', album: '', price: '0.50', genre: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>(null)

  if (!authenticated) {
    return (
      <div className="view upload-view">
        <div className="empty-state">
          <div className="empty-icon">🎙️</div>
          <p>Connect to upload your music</p>
          <button className="btn-primary" onClick={login}>Connect</button>
        </div>
      </div>
    )
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setStatus('uploading')
    // TODO: encrypt + vault + generate link
    // middleware.uploadTrack(file, form)
    setTimeout(() => setStatus('done'), 1500) // stub
  }

  const formFields: { key: keyof UploadForm; label: string; placeholder: string }[] = [
    { key: 'title',  label: 'Track Title', placeholder: 'Lagos at 3am'   },
    { key: 'artist', label: 'Artist Name', placeholder: 'Tunde Okafor'   },
    { key: 'album',  label: 'Album / EP',  placeholder: 'Neon Harmattan' },
    { key: 'genre',  label: 'Genre',       placeholder: 'Afrobeats'      },
  ]

  return (
    <div className="view upload-view">
      <div className="view-header">
        <h2 className="view-title">Upload Track</h2>
      </div>
      <form className="upload-form" onSubmit={handleUpload}>
        <div
          className="drop-zone"
          onClick={() => document.getElementById('file-input')?.click()}
        >
          {file
            ? <span className="drop-label">✓ {file.name}</span>
            : <span className="drop-label">Drop .mp3 here or click to browse</span>
          }
          <input
            id="file-input"
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFile(e.target.files?.[0] ?? null)
            }
          />
        </div>

        <div className="form-grid">
          {formFields.map(({ key, label, placeholder }) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="text"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm((f: UploadForm) => ({ ...f, [key]: e.target.value }))
                }
              />
            </div>
          ))}
          <div className="field">
            <label>Price per play (USDC)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.price}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm((f: UploadForm) => ({ ...f, price: e.target.value }))
              }
            />
          </div>
        </div>

        <button
          className="btn-primary"
          type="submit"
          disabled={!file || status === 'uploading'}
        >
          {status === 'uploading'
            ? 'Encrypting & uploading…'
            : status === 'done'
            ? '✓ Uploaded'
            : 'Encrypt & Publish'}
        </button>

        {status === 'done' && (
          <div className="share-link">
            <span>Share link:</span>
            <code>
              acs-dev.fangorn.network/play?owner=0x...&name={form.album}&tag={form.title}.mp3
            </code>
          </div>
        )}
      </form>
    </div>
  )
}

// ─── PlayerBar ─────────────────────────────────────────────────────────────────

interface PlayerBarProps {
  track: Track | null
  middleware: FangornMiddleware | null
}

function PlayerBar({ track, middleware }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<PlayState>('idle')
  const [error, setError] = useState<string | null>(null)
  const { authenticated, login } = usePrivy()

  useEffect(() => {
    setState('idle')
    setError(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
  }, [track?.id])

  const handlePlay = async () => {
    if (!authenticated) { login(); return }
    if (!middleware || !track) return

    if (state === 'playing') {
      audioRef.current?.pause()
      setState('idle')
      return
    }

    setState('loading')
    setError(null)

    const result = await middleware.fetchResource({
      owner: track.owner as `0x${string}`,
      datasourceName: track.datasourceName,
      tag: track.tag,
      baseUrl: import.meta.env.VITE_RESOURCE_SERVER_URL as string,
    })

    if (!result.success) {
      setState('error')
      setError((result as any).error ?? 'Payment failed')
      return
    }

    // Decode base64 → Blob → object URL → play
    const bytes = Uint8Array.from(atob((result as any).dataString), (c: string) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    if (audioRef.current) {
      audioRef.current.src = url
      audioRef.current.play()
    }
    setState('playing')
  }

  if (!track) return null

  const hue = (parseInt(track.id) * 67 + 180) % 360

  return (
    <div className="player-bar">
      <audio ref={audioRef} onEnded={() => setState('idle')} />

      <div className="player-track">
        <div className="player-art" style={{ '--hue': hue } as HueStyle}>
          {track.artist.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
        </div>
        <div>
          <div className="player-title">{track.title}</div>
          <div className="player-artist">{track.artist}</div>
        </div>
      </div>

      <div className="player-controls">
        <button
          className={`btn-play-large ${state === 'playing' ? 'active' : ''}`}
          onClick={handlePlay}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? '…' : state === 'playing' ? '▐▐' : `▶ $${track.price}`}
        </button>
        {error && <span className="player-error">{error}</span>}
      </div>

      <div className="player-meta">
        <span className="player-genre">{track.genre}</span>
        <span className="player-duration">{track.duration}</span>
      </div>
    </div>
  )
}

// ─── Nav ───────────────────────────────────────────────────────────────────────

const VIEWS: ViewName[] = ['Browse', 'Library', 'Upload']

interface NavProps {
  view: ViewName
  setView: (v: ViewName) => void
}

function Nav({ view, setView }: NavProps) {
  return (
    <nav className="nav">
      {VIEWS.map(v => (
        <button
          key={v}
          className={`nav-item ${view === v ? 'active' : ''}`}
          onClick={() => setView(v)}
        >
          {v}
        </button>
      ))}
    </nav>
  )
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<ViewName>('Browse')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const { middleware } = useFangornMiddleware()

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <span className="brand-mark">⬡</span>
          <span className="brand-name">Fangorn<span className="brand-dot">.</span>Music</span>
        </div>
        <Nav view={view} setView={setView} />
        <ConnectWallet />
      </header>

      <main className="main">
        {view === 'Browse' && (
          <BrowseView onPlay={setCurrentTrack} currentTrack={currentTrack} />
        )}
        {view === 'Library' && (
          <LibraryView onPlay={setCurrentTrack} currentTrack={currentTrack} />
        )}
        {view === 'Upload' && <UploadView />}
      </main>

      <PlayerBar track={currentTrack} middleware={middleware} />
    </div>
  )
}