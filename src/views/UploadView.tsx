import { useState, useCallback, useEffect, useRef } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type Hex } from 'viem'
import { Fangorn, FangornConfig } from '@fangorn-network/sdk'

// ─── Constants ────────────────────────────────────────────────────────────────

const R2_BUCKET  = 'my-first-bucket'
const R2_DIR     = 'my-first-dir'
const WORKER_URL = 'https://fangorn-access-worker.quickbeam.workers.dev'
const SCHEMA_NAME = 'fangorn.music.demo.v1'

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface TrackForm {
    title:       string
    artist:      string
    album:       string
    trackNumber: string
    genre:       string
    duration:    string
    image:       string
    price:       string
    filename:    string
}

const EMPTY_FORM: TrackForm = {
    title: '', artist: '', album: '', trackNumber: '',
    genre: '', duration: '', image: '', price: '1', filename: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function usePublisherFangorn() {
    const { user } = usePrivy()
    const { wallets } = useWallets()
    const [fangorn, setFangorn] = useState<Fangorn | null>(null)
    const [address, setAddress] = useState<Hex | null>(null)
    const [ready, setReady]     = useState(false)
    const [error, setError]     = useState<string | null>(null)
    const wallet = wallets[0]

    useEffect(() => {
        if (!wallet) return
        let cancelled = false
        setReady(false)
        setError(null)

        const init = async () => {
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
                storage: {
                    pinata: {
                        jwt:     import.meta.env.VITE_PINATA_JWT     ?? '',
                        gateway: import.meta.env.VITE_PINATA_GATEWAY ?? '',
                    }
                },
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

// ─── UploadPanel ──────────────────────────────────────────────────────────────

function UploadPanel({ fangorn, address }: { fangorn: Fangorn; address: Hex }) {
    const [form, setForm]           = useState<TrackForm>(EMPTY_FORM)
    const [status, setStatus]       = useState<UploadStatus>('idle')
    const [statusMsg, setStatusMsg] = useState('')
    const [manifestCid, setManifestCid] = useState<string | null>(null)
    const [copied, setCopied]       = useState(false)

    const setField = (key: keyof TrackForm) =>
        (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm(f => ({ ...f, [key]: e.target.value }))

    const canSubmit = !!form.filename.trim() && !!form.title && !!form.artist
        && status !== 'uploading'

    const handleUpload = async () => {
        if (!canSubmit) return
        try {
            setStatus('uploading')
            setStatusMsg('Publishing to Fangorn…')

            const name  = `${slug(form.artist)}-${slug(form.title)}-${Date.now()}`
            const price = BigInt(Math.round(parseFloat(form.price) || 1))

            console.log("using price " + price)
            console.log("using name " + name)
            const uri   = `r2://${R2_DIR}/${form.filename.trim()}`

            const { manifestUri: cid } = await fangorn.publisher.upload(
                {
                    records: [{
                        name,
                        fields: {
                            title:       form.title,
                            artist:      form.artist,
                            album:       form.album       || '',
                            trackNumber: form.trackNumber || '',
                            genre:       form.genre       || '',
                            duration:    form.duration    || '',
                            image:       form.image       || '',
                            audio: {
                                '@type':   'handle',
                                uri,
                                workerUrl: WORKER_URL,
                            },
                        },
                    }],
                    schemaName: SCHEMA_NAME,
                },
                price,
            )

            setManifestCid(cid)
            setStatus('done')
            setStatusMsg('')
        } catch (e: any) {
            setStatus('error')
            setStatusMsg(e?.message ?? 'Upload failed')
        }
    }

    const reset = () => {
        setForm(EMPTY_FORM)
        setStatus('idle')
        setStatusMsg('')
        setManifestCid(null)
        setCopied(false)
    }

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

            <h1>Coming Soon.</h1>
            <p>If you are an artist or publisher who wants to make their music available on Fangorn, get in touch with the team at hello@fangorn.network.</p>

            {/* <div className="studio-badge-row">
                <div className="studio-badge">
                    <span className="studio-badge-key">schema</span>
                    <code className="studio-badge-val">{SCHEMA_NAME}</code>
                </div>
                <div className="studio-badge">
                    <span className="studio-badge-key">owner</span>
                    <code className="studio-badge-val">{address.slice(0, 6)}…{address.slice(-4)}</code>
                </div>
            </div>

            <div className="studio-fields">
                <div className="studio-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="studio-label">
                        File <span className="studio-required">*</span>
                        <span className="studio-label-dim"> — {R2_DIR}/</span>
                    </label>
                    <input
                        className="studio-input"
                        type="text"
                        placeholder="my-song.mp3"
                        value={form.filename}
                        onChange={setField('filename')}
                        disabled={status === 'uploading'}
                    />
                </div>

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
                    <label className="studio-label">Duration</label>
                    <input className="studio-input" type="text" placeholder="3:42"
                        value={form.duration} onChange={setField('duration')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="studio-label">Image URL</label>
                    <input className="studio-input" type="text" placeholder="https://…"
                        value={form.image} onChange={setField('image')} disabled={status === 'uploading'} />
                </div>

                <div className="studio-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="studio-label">
                        Price <span className="studio-label-dim">(USDC units)</span>
                    </label>
                    <input className="studio-input" type="number" min="1" step="1" placeholder="1"
                        value={form.price} onChange={setField('price')} disabled={status === 'uploading'} />
                </div>
            </div> */}

            {/* {status === 'uploading' && (
                <div className="chain-loading" style={{ padding: '12px 0', justifyContent: 'flex-start' }}>
                    <span className="upload-spinner" />
                    <span style={{ fontSize: 13, color: 'var(--fg2)' }}>{statusMsg}</span>
                </div>
            )}
            {status === 'error' && <div className="upload-error">{statusMsg}</div>}

            <div className="studio-actions">
                <button className="btn-primary studio-submit" onClick={handleUpload} disabled={!canSubmit}>
                    {status === 'uploading' ? 'Publishing…' : 'Publish'}
                </button>
                <p className="studio-hint">
                    Audio is encrypted on publish. Listeners pay <strong>{form.price || '1'}</strong> USDC unit{form.price === '1' ? '' : 's'} to unlock.
                </p>
            </div> */}
        </div>
    )
}

// ─── UploadView ───────────────────────────────────────────────────────────────

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
                </div>
                <UploadPanel fangorn={fangorn} address={address} />
            </div>
        </div>
    )
}