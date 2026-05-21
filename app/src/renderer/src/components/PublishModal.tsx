import { useState } from "react";
import './NowPlaying.css';
import { Fangorn } from "@fangorn-network/sdk";
import { Hex } from "viem";
import { Track } from "../types";
import { usePrivy } from "@privy-io/react-auth";
import { computeTrackId } from "../lib/trackId";
import './PublishModal.css';

interface PublishModalProps {
    track: Track
    fangorn: Fangorn | null
    publisherAddress: Hex | null
    onClose: () => void
    onPublished: () => void
    accentColor: string
}

function resolveSource(track: Track): { platform: string; platformId: string } | null {
    if (track.youtubeVideoId) {
        if (track.id.startsWith('sc:') || track.youtubeVideoId.startsWith('http')) {
            return { platform: 'soundcloud', platformId: track.youtubeVideoId }
        }
        return { platform: 'youtube', platformId: track.youtubeVideoId }
    }
    if (track.spotifyTrackId) {
        return { platform: 'spotify', platformId: track.spotifyTrackId }
    }
    if (track.manifestCid) {
        return { platform: 'fangorn', platformId: track.manifestCid }
    }
    return null
}

export function PublishModal({ track, onClose, onPublished, fangorn, accentColor }: PublishModalProps) {
    const { getAccessToken } = usePrivy()

    const source = resolveSource(track)

    // Editable fields — pre-filled from track
    const [title,       setTitle]       = useState(track.title)
    const [artist,      setArtist]      = useState(track.artist)
    const [year,        setYear]        = useState(track.year?.toString() ?? '')
    const [durationMs,  setDurationMs]  = useState((track.durationMs ?? 0).toString())
    const [isrc,        setIsrc]        = useState('')
    const [platform,    setPlatform]    = useState(source?.platform    ?? '')
    const [platformId,  setPlatformId]  = useState(source?.platformId  ?? '')

    const [publishing, setPublishing] = useState(false)
    const [error,      setError]      = useState<string | null>(null)

    const handlePublish = async () => {
        if (!fangorn) { setError('Fangorn not initialized'); return }
        if (!title.trim())  { setError('Title is required');  return }
        if (!artist.trim()) { setError('Artist is required'); return }

        setPublishing(true)
        setError(null)

        try {
            await getAccessToken()
            const trackId = await computeTrackId(artist.trim(), title.trim())

            // ── 1. Track invariant ────────────────────────────────────────
            await fangorn.publisher.upload(
                {
                    records: [{
                        name: trackId,
                        fields: {
                            schemaVersion: 1,
                            isrcCode:      isrc.trim() || '',
                            trackId,
                            title:         title.trim(),
                            byArtist:      artist.trim(),
                            datePublished: year.trim() || '',
                            durationMs:    parseInt(durationMs) || 0,
                            contributors:  [],
                        } as any,
                    }],
                    schemaName: 'tony.test.invariants.track.2',
                },
                0n,
            )

            // ── 2. Source record ──────────────────────────────────────────
            if (platform.trim() && platformId.trim()) {
                await fangorn.publisher.upload(
                    {
                        records: [{
                            name: `${trackId}:${platform.trim()}`,
                            fields: {
                                trackId,
                                platform:   platform.trim(),
                                platformId: platformId.trim(),
                            } as any,
                        }],
                        schemaName: 'tony.test.source.track.0',
                    },
                    0n,
                )
            }

            onPublished()
        } catch (e: any) {
            setError(e.message ?? 'Publish failed')
        } finally {
            setPublishing(false)
        }
    }

    return (
        <div className="pm-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="pm-modal">

                <div className="pm-header">
                    <div>
                        <div className="pm-title">Publish to SOND3R</div>
                        <div className="pm-subtitle">{track.artist} — {track.title}</div>
                    </div>
                    <button className="pm-close" onClick={onClose}>×</button>
                </div>

                <div className="pm-body">

                    {/* ── Track fields ─────────────────────────────────── */}
                    <div className="pm-section-label">Track</div>

                    <div className="pm-row">
                        <div className="pm-field">
                            <label className="pm-label">Title</label>
                            <input className="pm-input" value={title} onChange={e => setTitle(e.target.value)} />
                        </div>
                        <div className="pm-field">
                            <label className="pm-label">Artist</label>
                            <input className="pm-input" value={artist} onChange={e => setArtist(e.target.value)} />
                        </div>
                    </div>

                    <div className="pm-row">
                        <div className="pm-field">
                            <label className="pm-label">Year</label>
                            <input className="pm-input" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 2023" />
                        </div>
                        <div className="pm-field">
                            <label className="pm-label">Duration (ms)</label>
                            <input className="pm-input" value={durationMs} onChange={e => setDurationMs(e.target.value)} />
                        </div>
                    </div>

                    <div className="pm-field">
                        <label className="pm-label">ISRC <span style={{ opacity: 0.4, fontWeight: 400 }}>optional</span></label>
                        <input className="pm-input" value={isrc} onChange={e => setIsrc(e.target.value)} placeholder="e.g. USUM71900594" />
                    </div>

                    {/* ── Source fields ─────────────────────────────────── */}
                    <div className="pm-section-label" style={{ marginTop: 16 }}>Playback Source</div>

                    <div className="pm-row">
                        <div className="pm-field" style={{ flex: '0 0 120px' }}>
                            <label className="pm-label">Platform</label>
                            <select
                                className="pm-input"
                                value={platform}
                                onChange={e => setPlatform(e.target.value)}
                                style={{ cursor: 'pointer' }}
                            >
                                <option value="">none</option>
                                <option value="youtube">youtube</option>
                                <option value="soundcloud">soundcloud</option>
                                <option value="spotify">spotify</option>
                                <option value="fangorn">fangorn</option>
                            </select>
                        </div>
                        <div className="pm-field">
                            <label className="pm-label">ID / URL</label>
                            <input
                                className="pm-input"
                                value={platformId}
                                onChange={e => setPlatformId(e.target.value)}
                                placeholder="video ID or URL"
                                style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                            />
                        </div>
                    </div>

                </div>

                {error && <div className="pm-error">{error}</div>}

                <div className="pm-footer">
                    <button className="pm-cancel" onClick={onClose}>Cancel</button>
                    <button
                        className="pm-submit"
                        onClick={handlePublish}
                        disabled={publishing}
                        style={{ background: accentColor }}
                    >
                        {publishing
                            ? <span className="upload-spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#000' }} />
                            : 'Publish'
                        }
                    </button>
                </div>
            </div>
        </div>
    )
}