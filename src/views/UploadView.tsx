// import { useState, useCallback } from 'react'
// import { usePrivy } from '@privy-io/react-auth'
// import { Fangorn, fieldToHex } from '@fangorn-network/sdk'
// import { useFangorn } from '../hooks/useFangorn'
// import type { UploadStatus, UploadPanel, AlbumView, ManifestEntry } from '../types'
// import type { PublishRecord } from '@fangorn-network/sdk/lib/roles/publisher'

// import * as SCHEMA from '../../schema.json';
// import type { SchemaDefinition } from '@fangorn-network/sdk/lib/roles/schema'
// import { SettlementRegistry } from '@fangorn-network/sdk/lib/registries/settlement-registry'

// // everything but the encrypted field
// interface TrackForm {
//     title: string           // string, public
//     artist: string          // string, public
//     price: string           // USDC per play — not a schema field, drives the gadget
// }
// // const SETTLEMENT_TRACKER: Record<string, string> = {
// //     arbitrumSepolia: '0x7c6ae9eb3398234eb69b2f3acfae69065505ff69',
// //     baseSepolia: '0x708751829f5f5f584da4142b62cd5cc9235c8a18',
// // }
// // const settlementAddress = () =>
// //     SETTLEMENT_TRACKER[CHAIN_CONFIG.chainName] ?? SETTLEMENT_TRACKER.arbitrumSepolia

// function shareLink(owner: string, schemaId: string, tag: string) {
//     return `${window.location.origin}/play?owner=${owner}&schema=${encodeURIComponent(schemaId)}&tag=${encodeURIComponent(tag)}`
// }
// function copyToClipboard(text: string) {
//     navigator.clipboard.writeText(text).catch(() => { })
// }

// // Attempt to read audio duration from the File before upload
// function readAudioDuration(file: File): Promise<number> {
//     return new Promise(resolve => {
//         const url = URL.createObjectURL(file)
//         const audio = new Audio(url)
//         audio.addEventListener('loadedmetadata', () => {
//             URL.revokeObjectURL(url)
//             resolve(Math.round(audio.duration) || 0)
//         })
//         audio.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(0) })
//     })
// }

// /// TrackRow
// function TrackRow({ entry, owner, schemaId }: {
//     entry: ManifestEntry; owner: string; schemaId: string
// }) {
//     const [copied, setCopied] = useState(false)
//     const link = shareLink(owner, schemaId, entry.tag)
//     return (
//         <div className="manifest-row">
//             <div className="manifest-row-info">
//                 <span className="manifest-tag">{entry.tag}</span>
//                 <span className="manifest-cid" title={entry.cid}>cid: {entry.cid.slice(0, 14)}…</span>
//             </div>
//             <button className="btn-copy" onClick={() => {
//                 copyToClipboard(link); setCopied(true); setTimeout(() => setCopied(false), 2000)
//             }}>
//                 {copied ? '✓ Copied' : 'Copy link'}
//             </button>
//         </div>
//     )
// }

// // UploadPanel
// const EMPTY_FORM: TrackForm = {
//     title: '', artist: '', price: '0.50',
// }

// function UploadPanel({ fangorn, ownerAddress }: {
//     fangorn: Fangorn,
//     ownerAddress: string,
//     //   schemaId: `0x${string}` | null
// }) {
//     const [form, setForm] = useState<TrackForm>(EMPTY_FORM)
//     const [file, setFile] = useState<File | null>(null)
//     const [status, setStatus] = useState<UploadStatus>('idle')
//     const [statusMsg, setStatusMsg] = useState('')
//     const [shareUrl, setShareUrl] = useState<string | null>(null)
//     const [copied, setCopied] = useState(false)

//     const setField = (key: keyof TrackForm) =>
//         (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }))

//     const handleDrop = useCallback((e: React.DragEvent) => {
//         e.preventDefault()
//         const dropped = e.dataTransfer.files[0]
//         if (!dropped?.type.startsWith('audio/')) return
//         setFile(dropped)
//         // Auto-fill duration from audio metadata
//         readAudioDuration(dropped).then(secs => {
//             if (secs) setForm(f => ({ ...f, duration_seconds: String(secs) }))
//         })
//     }, [])

//     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const picked = e.target.files?.[0] ?? null
//         setFile(picked)
//         if (picked) {
//             readAudioDuration(picked).then(secs => {
//                 if (secs) setForm(f => ({ ...f, duration_seconds: String(secs) }))
//             })
//         }
//     }

//     const handleUpload = async (e: React.FormEvent) => {
//         e.preventDefault()
//         if (!file || !fangorn) return

//         try {
//             setStatus('uploading')
//             setStatusMsg('Reading file…')
//             // Read as base64 in chunks to avoid stack overflow on large files
//             const arrayBuffer = await file.arrayBuffer()
//             const bytes = new Uint8Array(arrayBuffer)
//             const CHUNK = 0x8000
//             let binary = ''
//             for (let i = 0; i < bytes.length; i += CHUNK) {
//                 binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
//             }
//             const base64 = btoa(binary)
//             // file extension
//             const ext = file.name.split('.').pop() ?? 'mp3'
//             // format tag
//             const tag = `${form.title.toLowerCase().replace(/\s+/g, '-')}.${ext}`

//             // Filedata carries the audio; schema public fields travel as `metadata`
//             // so the manifest entry surfaces them alongside audio_cid (the stored CID)
//             const records: PublishRecord[] = [
//                 {
//                     tag,
//                     // Public schema fields stored as metadata on the entry
//                     fields: {
//                         title: form.title,
//                         artist: form.artist,
//                         audio: new TextEncoder().encode(base64)
//                     },
//                 }
//             ]

//             setStatusMsg('Encrypting & uploading to IPFS…')
//             // get the schema definition (cached locally)
//             // get the schemaId from the chain based on schema name
//             const schemaId = "0x0";
//             // encrypt and upload
//             const { manifestCid } = await fangorn.publisher.upload({
//                 records,
//                 SCHEMA,
//                 schemaId,
//                 "todo",
//                 gadgetFactory: (tag) => new <SettledGadget></SettledGadget>({
//                     resourceId: SettlementRegistry.deriveResourceId(owner, schemaId, tag),
//                     settlementRegistryAddress: this.config.settlementRegistryContractAddress,
//                     chainName: this.config.chainName,
//                     pinataJwt: this.pinataJwt,
//                 }),
//             }, price);

//             setShareUrl(shareLink(ownerAddress, schemaId, tag))
//             setStatus('done')
//             setStatusMsg('')
//         } catch (err: any) {
//             setStatus('error')
//             setStatusMsg(err.message ?? 'Upload failed')
//         }
//     }

//     const reset = () => {
//         setFile(null); setStatus('idle'); setStatusMsg(''); setShareUrl(null); setCopied(false)
//         setForm(EMPTY_FORM)
//     }

//     if (!schemaId) {
//         return (
//             <div className="upload-form">
//                 <div className="upload-status">
//                     <span className="upload-spinner" />
//                     Resolving schema {MUSIC_SCHEMA_NAME}…
//                 </div>
//             </div>
//         )
//     }

//     const canSubmit = !!file && !!form.title && !!form.artist && status !== 'uploading'

//     return (
//         <form className="upload-form" onSubmit={handleUpload}>
//             {/* Schema badge */}
//             <div className="schema-badge">
//                 <span className="schema-label">schema</span>
//                 <code className="schema-name">{MUSIC_SCHEMA_NAME}</code>
//             </div>

//             {/* Drop zone */}
//             <div
//                 className={`drop-zone ${file ? 'has-file' : ''}`}
//                 onClick={() => document.getElementById('file-input')?.click()}
//                 onDrop={handleDrop}
//                 onDragOver={e => e.preventDefault()}
//             >
//                 {file ? (
//                     <span className="drop-label">✓ {file.name}</span>
//                 ) : (
//                     <>
//                         <span className="drop-icon">♪</span>
//                         <span className="drop-label">Drop audio file or click to browse</span>
//                         <span className="drop-hint">.mp3 · .wav · .flac · .aac</span>
//                     </>
//                 )}
//                 <input id="file-input" type="file" accept="audio/*"
//                     style={{ display: 'none' }} onChange={handleFileChange} />
//             </div>

//             {/* Schema fields */}
//             <div className="form-grid">
//                 {/* title */}
//                 <div className="field">
//                     <label>Title <span className="field-required">*</span></label>
//                     <input type="text" placeholder="Lagos at 3am"
//                         value={form.title} onChange={setField('title')} />
//                 </div>

//                 {/* artist */}
//                 <div className="field">
//                     <label>Artist <span className="field-required">*</span></label>
//                     <input type="text" placeholder="Tunde Okafor"
//                         value={form.artist} onChange={setField('artist')} />
//                 </div>

//                 {/* genre */}
//                 <div className="field">
//                     <label>Genre</label>
//                     <input type="text" placeholder="Afrobeats"
//                         value={form.genre} onChange={setField('genre')} />
//                 </div>

//                 {/* duration_seconds — auto-filled from audio, editable */}
//                 <div className="field">
//                     <label>Duration (seconds)</label>
//                     <input type="number" min="0" placeholder="auto-detected"
//                         value={form.duration_seconds} onChange={setField('duration_seconds')} />
//                 </div>

//                 {/* cover_art_url */}
//                 <div className="field" style={{ gridColumn: '1 / -1' }}>
//                     <label>Cover art URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
//                     <input type="url" placeholder="https://cdn.example.com/cover.jpg"
//                         value={form.cover_art_url} onChange={setField('cover_art_url')} />
//                 </div>

//                 {/* price — not a schema field, drives PaymentGadget */}
//                 <div className="field">
//                     <label>Price per play (USDC) <span className="field-required">*</span></label>
//                     <input type="number" step="0.000001" min="0.000001"
//                         value={form.price} onChange={setField('price')} />
//                 </div>
//             </div>

//             {status === 'uploading' && (
//                 <div className="upload-status"><span className="upload-spinner" />{statusMsg}</div>
//             )}
//             {status === 'error' && <div className="upload-error">{statusMsg}</div>}

//             <div style={{ display: 'flex', gap: 10 }}>
//                 <button className="btn-primary" type="submit" disabled={!canSubmit}>
//                     {status === 'uploading' ? 'Encrypting & uploading…' : 'Encrypt & Publish'}
//                 </button>
//                 {status === 'done' && (
//                     <button type="button" className="btn-primary" onClick={reset}
//                         style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
//                         Upload another
//                     </button>
//                 )}
//             </div>

//             {status === 'done' && shareUrl && (
//                 <div className="share-link">
//                     <span className="share-label">Share link</span>
//                     <div className="share-row">
//                         <code className="share-url">{shareUrl}</code>
//                         <button type="button" className="btn-copy" onClick={() => {
//                             copyToClipboard(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000)
//                         }}>{copied ? '✓ Copied' : 'Copy'}</button>
//                     </div>
//                     <p className="field-hint">
//                         Anyone with this link pays ${form.price} USDC to unlock the track.
//                     </p>
//                 </div>
//             )}
//         </form>
//     )
// }

// // ─── ManagePanel ──────────────────────────────────────────────────────────────

// function ManagePanel({ ownerAddress, schemaId, fetchTracks }: {
//     ownerAddress: string
//     schemaId: `0x${string}` | null
//     fetchTracks: () => Promise<AlbumView[]>
// }) {
//     const [albums, setAlbums] = useState<AlbumView[]>([])
//     const [loading, setLoading] = useState(false)
//     const [error, setError] = useState<string | null>(null)
//     const [fetched, setFetched] = useState(false)

//     const handleFetch = async () => {
//         if (!schemaId) return
//         setLoading(true); setError(null)
//         try {
//             const result = await fetchTracks()
//             setAlbums(result)
//             setFetched(true)
//             if (!result.length || !result[0].entries.length) {
//                 setError(`No tracks found under ${MUSIC_SCHEMA_NAME} for this wallet.`)
//             }
//         } catch (e: any) {
//             setError(e.message)
//         } finally {
//             setLoading(false)
//         }
//     }

//     const totalTracks = albums.reduce((n, a) => n + a.entries.length, 0)

//     return (
//         <div className="manage-panel">
//             <div className="schema-badge" style={{ marginBottom: 16 }}>
//                 <span className="schema-label">schema</span>
//                 <code className="schema-name">{MUSIC_SCHEMA_NAME}</code>
//             </div>

//             <button className="btn-primary" onClick={handleFetch}
//                 disabled={loading || !schemaId} style={{ marginBottom: 16 }}>
//                 {loading ? 'Loading…' : fetched ? `Refresh (${totalTracks} tracks)` : 'Load my tracks'}
//             </button>

//             {error && <div className="upload-error" style={{ marginBottom: 12 }}>{error}</div>}

//             {albums.flatMap(album =>
//                 album.entries.map(entry => (
//                     <TrackRow
//                         key={entry.tag}
//                         entry={entry}
//                         owner={ownerAddress}
//                         schemaId={schemaId ?? ''}
//                     />
//                 ))
//             )}
//         </div>
//     )
// }

// // ─── UploadView ───────────────────────────────────────────────────────────────
// // Register tab removed — DataSourceRegistry has no registerDataSource method.
// // Publishing a manifest for the first time IS the registration.

// export function UploadView() {
//     const { authenticated, login } = usePrivy()
//     const [panel, setPanel] = useState<UploadPanel>('upload')

//     const { fangorn, walletClient, address, loading, error } = useFangorn()

//     if (!authenticated) {
//         return (
//             <div className="view upload-view">
//                 <div className="empty-state">
//                     <div className="empty-icon">🎙️</div>
//                     <p>Connect to publish your music</p>
//                     <button className="btn-primary" onClick={login}>Connect</button>
//                 </div>
//             </div>
//         )
//     }

//     if (loading) {
//         return (
//             <div className="view upload-view">
//                 <div className="empty-state">
//                     <span className="upload-spinner" style={{ width: 20, height: 20 }} />
//                     <p>Initializing Fangorn…</p>
//                 </div>
//             </div>
//         )
//     }

//     if (error) {
//         return (
//             <div className="view upload-view">
//                 <div className="upload-error">Failed to initialize: {error}</div>
//             </div>
//         )
//     }

//     if (!fangorn || !address) {
//         return (
//             <div className="view upload-view">
//                 <div className="empty-state"><p>Wallet not ready — connect above.</p></div>
//             </div>
//         )
//     }

//     return (
//         <div className="view upload-view">
//             <div className="view-header">
//                 <h2 className="view-title">Artist Studio</h2>
//                 <div className="panel-tabs">
//                     {(['upload', 'manage'] as UploadPanel[]).map(p => (
//                         <button key={p} className={`panel-tab ${panel === p ? 'active' : ''}`}
//                             onClick={() => setPanel(p)}>
//                             {p.charAt(0).toUpperCase() + p.slice(1)}
//                         </button>
//                     ))}
//                 </div>
//             </div>

//             {panel === 'upload' && (
//                 <UploadPanel
//                     fangorn={fangorn}
//                     ownerAddress={address}
//                 />
//             )}
//             {panel === 'manage' && (
//                 <ManagePanel
//                     ownerAddress={address}
//                     schemaId={musicSchemaId}
//                 />
//             )}
//         </div>
//     )
// }