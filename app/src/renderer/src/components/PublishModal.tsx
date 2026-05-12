import { useState } from "react";
import './NowPlaying.css';
import { Fangorn } from "@fangorn-network/sdk";
import { Hex } from "viem";
import { Track } from "../types";
import { usePrivy } from "@privy-io/react-auth";

interface PublishModalProps {
    track: Track
    fangorn: Fangorn | null
    publisherAddress: Hex | null
    onClose: () => void
    onPublished: () => void
    accentColor: string
}

export function PublishModal({ track, onClose, onPublished, fangorn, accentColor }: PublishModalProps) {
    // const [genres, setGenres] = useState<string[]>(track.genres)
    // const [moods, setMoods] = useState<string[]>(track.moods)
    // const [contexts, setContexts] = useState<string[]>(track.contexts)
    // const [themes, setThemes] = useState<string[]>(track.themes)

    const [genres, setGenres] = useState<string[]>([])
    const [moods, setMoods] = useState<string[]>([])
    const [contexts, setContexts] = useState<string[]>([])
    const [themes, setThemes] = useState<string[]>([])

    const { getAccessToken } = usePrivy()


    const [input, setInput] = useState<Record<string, string>>({
        genres: '', moods: '', contexts: '', themes: ''
    })
    const [publishing, setPublishing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const addTag = (field: string, set: React.Dispatch<React.SetStateAction<string[]>>) => {
        const val = input[field].trim()
        if (!val) return
        set(prev => prev.includes(val) ? prev : [...prev, val])
        setInput(i => ({ ...i, [field]: '' }))
    }

    const removeTag = (set: React.Dispatch<React.SetStateAction<string[]>>, val: string) =>
        set(prev => prev.filter(v => v !== val))

    const handlePublish = async () => {
        console.log("hey")
        if (!fangorn) { setError('Fangorn not initialized'); return }

        setPublishing(true)
        setError(null)

        const token = await getAccessToken()
        console.log('jwt at signing time:', token)

        try {
            await fangorn.publisher.upload(
                {
                    records: [{
                        name: track.spotifyTrackId
                            ?? `${track.artist}-${track.title}`.replace(/\s+/g, '-').toLowerCase(),
                        fields: {
                            schemaVersion: 1,
                            isrcCode: '',
                            trackId: track.spotifyTrackId ?? '',
                            title: track.title,
                            byArtist: track.artist,
                            datePublished: (track.year ? `${track.year}` : 0).toString(),
                            durationMs: track.durationMs ?? 0,
                            contributors: [],
                        } as any,
                    }],
                    schemaName: 'tony.test.invariants.track.2'
                    // (import.meta as any).env.VITE_FANGORN_SCHEMA_NAME ?? 'fangorn.music.v1',
                },
                0n,
            )
            onPublished()
        } catch (e: any) {
            setError(e.message ?? 'Publish failed')
        } finally {
            setPublishing(false)
        }
    }

    const TagField = ({
        label, field, tags, set
    }: { label: string; field: string; tags: string[]; set: React.Dispatch<React.SetStateAction<string[]>> }) => (
        <div className="pm-field">
            <label className="pm-label">{label}</label>
            <div className="pm-tags">
                {tags.map(t => (
                    <span key={t} className="pm-tag">
                        {t}
                        <button onClick={() => removeTag(set, t)} className="pm-tag-x">×</button>
                    </span>
                ))}
            </div>
            <div className="pm-input-row">
                <input
                    className="pm-input"
                    placeholder={`add ${label.toLowerCase()}…`}
                    value={input[field]}
                    onChange={e => setInput(i => ({ ...i, [field]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(field, set) } }}
                />
                <button className="pm-add" onClick={() => addTag(field, set)}>+</button>
            </div>
        </div>
    )

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