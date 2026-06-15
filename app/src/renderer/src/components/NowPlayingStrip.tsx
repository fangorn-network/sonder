import { useCallback } from 'react'
import { useSpotifyContext } from '../context/SpotifyContext'
import type { View } from '../views/TrackWikiView'

const BG1    = 'var(--bg1)'
const FG     = 'var(--fg)'
const FG3    = 'var(--fg3)'
const FG4    = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const BORDER = 'var(--border)'
const MONO   = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS   = 'var(--font-body,"Geist","Inter",sans-serif)'

function fmtTime(ms: number) {
    if (!ms || !isFinite(ms) || ms <= 0) return '0:00'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

interface Props {
    onNavigate: (v: View) => void
    onExpand: () => void
}

export function NowPlayingStrip({ onNavigate, onExpand }: Props) {
    const {
        currentTitle,
        currentArtist,
        currentVideoId,
        isPlaying,
        progressMs,
        durationMs,
        pause,
        resume,
        seek,
    } = useSpotifyContext()

    const progress = durationMs > 0 ? Math.min(progressMs / durationMs, 1) : 0

    const scrubTo = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        seek(ratio * durationMs)
    }, [seek, durationMs])

    if (!currentVideoId) return null

    return (
        <div style={{
            height: 24,
            background: BG1,
            borderTop: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 10,
            flexShrink: 0,
            position: 'relative',
            zIndex: 40,
            WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}>

            {/* Play/pause toggle */}
            <button
                onClick={() => isPlaying ? pause() : resume()}
                style={{ background: 'none', border: 'none', color: FG3, fontSize: 10, cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: MONO, lineHeight: 1 }}>
                {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Track info */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, flex: '0 0 auto', maxWidth: 340 }}>
                <button
                    onClick={() => currentTitle && currentArtist && onNavigate({ kind: 'track', artist: currentArtist, title: currentTitle })}
                    style={{ background: 'none', border: 'none', color: FG, fontFamily: SANS, fontSize: 11, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                    {currentTitle ?? '—'}
                </button>
                <span style={{ color: FG4, fontSize: 10, fontFamily: MONO, flexShrink: 0 }}>·</span>
                <button
                    onClick={() => currentArtist && onNavigate({ kind: 'artist', name: currentArtist })}
                    style={{ background: 'none', border: 'none', color: FG3, fontFamily: MONO, fontSize: 10, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                    {currentArtist ?? '—'}
                </button>
            </div>

            {/* Progress scrubber — fills remaining space */}
            <div
                onClick={scrubTo}
                style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative' }}>
                <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${progress * 100}%`,
                    background: ACCENT,
                    transition: 'width 0.5s linear',
                }} />
            </div>

            {/* Time */}
            <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, flexShrink: 0, letterSpacing: '0.04em' }}>
                {fmtTime(progressMs)} / {fmtTime(durationMs)}
            </span>

            {/* Expand to full NowPlaying */}
            <button
                onClick={onExpand}
                style={{ background: 'none', border: 'none', color: FG4, fontSize: 10, cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: MONO }}>
                ↑
            </button>
        </div>
    )
}
