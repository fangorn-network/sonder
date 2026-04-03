import { useState, useCallback, useEffect, useRef } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type Hex } from 'viem'
import { Fangorn, FangornConfig } from '@fangorn-network/sdk'
// import * as MUSIC_SCHEMA from '../../schema.json';
import '../App.css';
import type { SchemaDefinition } from '@fangorn-network/sdk/lib/roles/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal browser-native ID3v2 parser (no dependencies)
// ─────────────────────────────────────────────────────────────────────────────

function parseId3v2(buf: Uint8Array): {
    title?: string; artist?: string; genre?: string
    album?: string; trackNumber?: string
} {
    const result: { title?: string; artist?: string; genre?: string; album?: string; trackNumber?: string } = {}
    if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return result

    const version = buf[3]
    const size =
        ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) |
        ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)

    let offset = 10
    const end = Math.min(10 + size, buf.length)
    const decUtf8 = new TextDecoder('utf-8')
    const decLatin = new TextDecoder('iso-8859-1')
    const FRAMES = new Set(['TIT2', 'TPE1', 'TCON', 'TALB', 'TRCK'])

    while (offset + 10 <= end) {
        const frameId = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3])
        if (frameId === '\0\0\0\0') break

        const frameSize = version >= 4
            ? ((buf[offset + 4] & 0x7f) << 21) | ((buf[offset + 5] & 0x7f) << 14) |
            ((buf[offset + 6] & 0x7f) << 7) | (buf[offset + 7] & 0x7f)
            : (buf[offset + 4] << 24) | (buf[offset + 5] << 16) |
            (buf[offset + 6] << 8) | buf[offset + 7]

        offset += 10
        if (frameSize <= 0 || offset + frameSize > end) break

        if (FRAMES.has(frameId)) {
            const encoding = buf[offset]
            const raw = buf.subarray(offset + 1, offset + frameSize)
            const text = (encoding === 0 ? decLatin : decUtf8).decode(raw).replace(/\0/g, '').trim()
            if (frameId === 'TIT2') result.title = text
            if (frameId === 'TPE1') result.artist = text
            if (frameId === 'TCON') result.genre = text.replace(/^\(\d+\)/, '').trim() || text
            if (frameId === 'TALB') result.album = text
            if (frameId === 'TRCK') result.trackNumber = text.split('/')[0] // "3/12" → "3"
        }

        offset += frameSize
    }

    return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_NAME = 'fangorn.music.test.v3'
const SCHEMA_ID = '0x773dae8ae3b545f8824005428deabf97c65672d31887c7ed02d55b09b69e576a' as Hex

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'parsing' | 'uploading' | 'done' | 'error'

interface TrackForm {
    title: string
    artist: string
    album: string
    trackNumber: string
    genre: string
    duration: string  // ISO 8601 e.g. "PT3M42S"
    price: string
}

const EMPTY_FORM: TrackForm = {
    title: '', artist: '', album: '', trackNumber: '', genre: '', duration: '', price: '1',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function slug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function secondsToIso(secs: number): string {
    if (!secs) return ''
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    let d = 'PT'
    if (h) d += `${h}H`
    if (m) d += `${m}M`
    if (s || (!h && !m)) d += `${s}S`
    return d
}

function isoToDisplay(iso: string): string {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return iso
    const h = parseInt(match[1] ?? '0')
    const m = parseInt(match[2] ?? '0')
    const s = parseInt(match[3] ?? '0')
    const total = h * 3600 + m * 60 + s
    const mm = Math.floor(total / 60)
    const ss = total % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1_048_576).toFixed(1)} MB`
}

async function parseAudioFile(file: File): Promise<Partial<TrackForm>> {
    const result: Partial<TrackForm> = {}

    // 1. Embedded ID3v2 tags
    try {
        const slice = await file.slice(0, 256 * 1024).arrayBuffer()
        const tags = parseId3v2(new Uint8Array(slice))
        if (tags.title) result.title = tags.title
        if (tags.artist) result.artist = tags.artist
        if (tags.genre) result.genre = tags.genre
        if (tags.album) result.album = tags.album
        if (tags.trackNumber) result.trackNumber = tags.trackNumber
    } catch { /* silent */ }

    // 2. Filename heuristic: "Artist - Title.mp3"
    if (!result.title || !result.artist) {
        const stem = file.name.replace(/\.[^.]+$/, '')
        if (stem.includes(' - ')) {
            const [a, t] = stem.split(' - ', 2)
            if (!result.artist) result.artist = a.trim()
            if (!result.title) result.title = t.trim()
        } else {
            if (!result.title) result.title = stem
        }
    }

    // 3. Duration via Audio element → ISO 8601
    const durationSecs = await new Promise<number>(resolve => {
        const url = URL.createObjectURL(file)
        const audio = new Audio(url)
        audio.addEventListener('loadedmetadata', () => { URL.revokeObjectURL(url); resolve(Math.round(audio.duration) || 0) })
        audio.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(0) })
    })
    if (durationSecs) result.duration = secondsToIso(durationSecs)

    return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: publisher Fangorn instance
// ─────────────────────────────────────────────────────────────────────────────

function usePublisherFangorn() {
    const { user } = usePrivy()
    const { wallets } = useWallets()
    const [fangorn, setFangorn] = useState<Fangorn | null>(null)
    const [address, setAddress] = useState<Hex | null>(null)
    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const wallet = wallets[0]

    useEffect(() => {
        if (!wallet) return
        let cancelled = false
        setReady(false)
        setError(null)

        const init = async () => {
            const email =
                user?.email?.address ??
                (user as any)?.google?.email ??
                'driemworks@fangorn.network'

            const provider = await wallet.getEthereumProvider()
            const wc = createWalletClient({
                account: wallet.address as Hex,
                chain: {
                    ...FangornConfig.ArbitrumSepolia.chain,
                    fees: { baseFeeMultiplier: 2 },
                },
                transport: custom(provider),
            })
            const fg = await Fangorn.create({
                walletClient: wc,
                storage: { storacha: { email } },
                encryption: { lit: true },
                config: FangornConfig.ArbitrumSepolia,
                domain: window.location.host,
            })
            if (cancelled) return
            setFangorn(fg)
            setAddress(wallet.address as Hex)
            setReady(true)
        }

        init().catch(e => { if (!cancelled) setError(e.message ?? String(e)) })
        return () => { cancelled = true }
    }, [wallet?.address, user?.email?.address])

    return { fangorn, address, ready, error }
}

// ─────────────────────────────────────────────────────────────────────────────
// UploadPanel
// ─────────────────────────────────────────────────────────────────────────────

function UploadPanel({ fangorn, address }: { fangorn: Fangorn; address: Hex }) {
    const [form, setForm] = useState<TrackForm>(EMPTY_FORM)
    const [file, setFile] = useState<File | null>(null)
    const [status, setStatus] = useState<UploadStatus>('idle')
    const [statusMsg, setStatusMsg] = useState('')
    const [manifestCid, setManifestCid] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [copied, setCopied] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const setField = (key: keyof TrackForm) =>
        (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm(f => ({ ...f, [key]: e.target.value }))

    const pickFile = useCallback(async (f: File) => {
        if (!f.type.startsWith('audio/')) return
        setFile(f)
        setStatus('parsing')
        try {
            const parsed = await parseAudioFile(f)
            setForm(prev => ({
                ...prev,
                title: parsed.title ?? prev.title,
                artist: parsed.artist ?? prev.artist,
                album: parsed.album ?? prev.album,
                trackNumber: parsed.trackNumber ?? prev.trackNumber,
                genre: parsed.genre ?? prev.genre,
                duration: parsed.duration ?? prev.duration,
            }))
        } finally {
            setStatus('idle')
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) pickFile(dropped)
    }, [pickFile])

    const schemaDef: SchemaDefinition =
    {
        "title": {
            "@type": "string"
        },
        "artist": {
            "@type": "string"
        },
        "album": {
            "@type": "string"
        },
        "trackNumber": {
            "@type": "string"
        },
        "genre": {
            "@type": "string"
        },
        "duration": {
            "@type": "string"
        },
        "audio": {
            "@type": "encrypted",
            "gadget": "settled"
        }
    };

    const handleUpload = async () => {
        if (!file || !form.title || !form.artist) return
        try {
            setStatus('uploading')
            setStatusMsg('Reading audio…')
            const arrayBuffer = await file.arrayBuffer()
            const audioBytes = new Uint8Array(arrayBuffer)
            const tag = `${slug(form.artist)}-${slug(form.title)}-${Date.now()}`
            const price = BigInt(Math.round(parseFloat(form.price) || 1))

            setStatusMsg('Encrypting & uploading to IPFS…')
            const { manifestCid: cid } = await fangorn.publisher.upload(
                {
                    records: [{
                        tag,
                        fields: {
                            title: form.title,
                            artist: form.artist,
                            album: form.album || '',
                            trackNumber: form.trackNumber || '',
                            genre: form.genre || '',
                            duration: form.duration || '',
                            audio: { data: audioBytes, fileType: file.type || 'audio/mpeg' },
                        },
                    }],
                    schema: schemaDef,
                    schemaId: SCHEMA_ID,
                    gateway: '',
                },
                price,
            )

            setManifestCid(cid)
            setStatus('done')
            setStatusMsg('')
        } catch (e: any) {
            setStatus('error')
            setStatusMsg(e.message ?? 'Upload failed')
        }
    }

    const reset = () => {
        setFile(null)
        setForm(EMPTY_FORM)
        setStatus('idle')
        setStatusMsg('')
        setManifestCid(null)
        setCopied(false)
    }

    const canSubmit = !!file && !!form.title && !!form.artist
        && status !== 'uploading' && status !== 'parsing'

    // ── Done ──────────────────────────────────────────────────────────────────
    if (status === 'done' && manifestCid) {
        return (
            <div className="studio-done">
                <div className="studio-done-glyph">✦</div>
                <h3 className="studio-done-title">Published</h3>
                <p className="studio-done-sub">{form.title} · {form.artist}</p>
                <div className="studio-cid-row">
                    <span className="studio-cid-label">manifest</span>
                    <code className="studio-cid-value">{manifestCid.slice(0, 24)}…</code>
                    <button className="studio-cid-copy" onClick={() => {
                        navigator.clipboard.writeText(manifestCid)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                    }}>{copied ? '✓' : 'copy'}</button>
                </div>
                <button className="btn-primary studio-done-action" onClick={reset}>
                    Publish another
                </button>
            </div>
        )
    }

    return (
        <div className="studio-form">

            {/* Badges */}
            <div className="studio-badge-row">
                <div className="studio-badge">
                    <span className="studio-badge-key">schema</span>
                    <code className="studio-badge-val">{SCHEMA_NAME}</code>
                </div>
                <div className="studio-badge">
                    <span className="studio-badge-key">owner</span>
                    <code className="studio-badge-val">{address.slice(0, 6)}…{address.slice(-4)}</code>
                </div>
            </div>

            {/* Drop zone */}
            <div
                className={[
                    'studio-drop',
                    file ? 'has-file' : '',
                    dragging ? 'is-dragging' : '',
                    status === 'parsing' ? 'is-parsing' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => !file && fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
            >
                {status === 'parsing' ? (
                    <div className="studio-drop-state">
                        <span className="upload-spinner" />
                        <span className="studio-drop-label">Reading metadata…</span>
                    </div>
                ) : file ? (
                    <div className="studio-drop-state studio-drop-filled">
                        <div className="studio-drop-note">♪</div>
                        <div className="studio-drop-info">
                            <span className="studio-drop-filename">{file.name}</span>
                            <span className="studio-drop-meta">
                                {formatSize(file.size)}
                                {form.duration && <> · {isoToDisplay(form.duration)}</>}
                            </span>
                        </div>
                        <button className="studio-drop-clear"
                            onClick={e => { e.stopPropagation(); reset() }}>✕</button>
                    </div>
                ) : (
                    <div className="studio-drop-state">
                        <div className="studio-drop-arrow">↓</div>
                        <p className="studio-drop-label">Drop an audio file</p>
                        <p className="studio-drop-hint">ID3 tags auto-populated · mp3 wav flac aac ogg</p>
                        <button className="studio-drop-browse"
                            onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                            Browse
                        </button>
                    </div>
                )}
                <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />
            </div>

            {/* Fields */}
            <div className="studio-fields">
                <div className="studio-field">
                    <label className="studio-label">Title <span className="studio-required">*</span></label>
                    <input className="studio-input" type="text" placeholder="Cassini Division"
                        value={form.title} onChange={setField('title')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field">
                    <label className="studio-label">Artist <span className="studio-required">*</span></label>
                    <input className="studio-input" type="text" placeholder="Arca"
                        value={form.artist} onChange={setField('artist')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field">
                    <label className="studio-label">Album</label>
                    <input className="studio-input" type="text" placeholder="Mutant"
                        value={form.album} onChange={setField('album')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field">
                    <label className="studio-label">Track #</label>
                    <input className="studio-input" type="text" placeholder="1"
                        value={form.trackNumber} onChange={setField('trackNumber')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field">
                    <label className="studio-label">Genre</label>
                    <input className="studio-input" type="text" placeholder="Electronic"
                        value={form.genre} onChange={setField('genre')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field">
                    <label className="studio-label">
                        Duration <span className="studio-label-dim">(auto-detected)</span>
                    </label>
                    <input className="studio-input" type="text" placeholder="PT3M42S"
                        value={form.duration} onChange={setField('duration')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="studio-label">
                        Price <span className="studio-label-dim">(USDC units)</span>
                    </label>
                    <input className="studio-input" type="number" min="1" step="1" placeholder="1"
                        value={form.price} onChange={setField('price')} disabled={status === 'uploading'} />
                </div>
            </div>

            {/* Status */}
            {status === 'uploading' && (
                <div className="chain-loading" style={{ padding: '12px 0', justifyContent: 'flex-start' }}>
                    <span className="upload-spinner" />
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{statusMsg}</span>
                </div>
            )}
            {status === 'error' && <div className="upload-error">{statusMsg}</div>}

            {/* Submit */}
            <div className="studio-actions">
                <button className="btn-primary studio-submit" onClick={handleUpload} disabled={!canSubmit}>
                    {status === 'uploading' ? 'Publishing…' : 'Encrypt & Publish'}
                </button>
                <p className="studio-hint">
                    Audio is threshold-encrypted on publish.
                    Listeners pay <strong>{form.price || '1'}</strong> USDC unit{form.price === '1' ? '' : 's'} to unlock.
                </p>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// UploadView
// ─────────────────────────────────────────────────────────────────────────────

export function UploadView() {
    const { authenticated, login } = usePrivy()
    const { fangorn, address, ready, error } = usePublisherFangorn()

    if (!authenticated) {
        return (
            <div className="view upload-view">
                <div className="empty-state">
                    <div className="empty-icon" style={{ fontSize: 48 }}>🎙</div>
                    <p>Connect your wallet to publish music</p>
                    <button className="btn-primary" style={{ marginTop: 20 }} onClick={login}>
                        Connect wallet
                    </button>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="view upload-view">
                <div className="upload-error" style={{ maxWidth: 560, margin: '40px auto 0' }}>
                    Failed to initialize: {error}
                </div>
            </div>
        )
    }

    if (!ready || !fangorn || !address) {
        return (
            <div className="view upload-view">
                <div className="chain-loading">
                    <span className="upload-spinner" />
                    Initializing Fangorn…
                </div>
            </div>
        )
    }

    return (
        <div className="view upload-view">
            <div className="studio-wrap">
                <div className="studio-header">
                    <h2 className="studio-title">Artist Studio</h2>
                    <p className="studio-sub">Publish encrypted music to the Fangorn network.</p>
                </div>
                <UploadPanel fangorn={fangorn} address={address} />
            </div>
        </div>
    )
}