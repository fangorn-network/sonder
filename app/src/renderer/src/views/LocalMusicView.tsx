/**
 * views/LocalMusicView.tsx
 *
 * Full-surface view for on-disk music: pick a folder (defaults to the OS music
 * dir), browse what was found, and play it in-app. Reads everything from
 * LocalMusicProvider; holds no playback state of its own so audio keeps going if
 * the view is closed.
 */

import { useEffect } from 'react'
import { useLocalMusic, type LocalTrack } from '../providers/LocalMusicProvider'

// ── Design tokens (light editorial — matches the app shell) ───────────────────
const BG1 = 'var(--bg1)'
const BG2 = 'var(--bg2)'
const FG = 'var(--fg)'
const FG2 = 'var(--fg2)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP = 'var(--font-display,"Bebas Neue",sans-serif)'

function fmtTime(sec: number): string {
  if (!sec || !isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export function LocalMusicView({ onClose }: { onClose: () => void }) {
  const lm = useLocalMusic()

  // Scan lazily the first time the view is shown.
  useEffect(() => { lm.ensureLoaded() }, [lm.ensureLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'absolute', inset: 0, background: BG1, color: FG,
      display: 'flex', flexDirection: 'column', fontFamily: SANS,
    }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '16px 22px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISP, fontSize: 26, letterSpacing: '0.06em', lineHeight: 1 }}>
            LOCAL MUSIC
          </div>
          <div
            title={lm.dir ?? ''}
            style={{
              fontFamily: MONO, fontSize: 10, color: FG3, marginTop: 5,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '60vw',
            }}
          >
            {lm.dir ?? 'No folder selected'}
          </div>
        </div>

        <HeaderBtn label="Change folder" onClick={lm.chooseFolder} />
        <HeaderBtn label={lm.loading ? 'Scanning…' : 'Rescan'} onClick={lm.rescan} disabled={lm.loading} />
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: 'pointer', fontFamily: MONO, padding: '0 4px' }}
          title="Close"
        >✕</button>
      </div>

      {/* ── Track list ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {lm.error && (
          <div style={{ padding: '14px 22px', color: ACCENT, fontFamily: MONO, fontSize: 12 }}>
            {lm.error}
          </div>
        )}

        {lm.loading && lm.tracks.length === 0 && (
          <EmptyState text="Scanning your music folder…" />
        )}

        {!lm.loading && lm.tracks.length === 0 && !lm.error && (
          <EmptyState
            text="No audio files found here."
            hint="Try “Change folder” to point SOND3R at your music."
          />
        )}

        {lm.tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            index={i + 1}
            track={track}
            active={lm.current?.id === track.id}
            playing={lm.current?.id === track.id && lm.isPlaying}
            onPlay={() => lm.playTrack(track)}
          />
        ))}
      </div>

      {/* ── Player bar ─────────────────────────────────────────────────── */}
      {lm.current && <PlayerBar />}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeaderBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: `1px solid ${BORDER}`, color: FG2,
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase',
        padding: '7px 12px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ padding: '60px 22px', textAlign: 'center', color: FG3 }}>
      <div style={{ fontFamily: SANS, fontSize: 14 }}>{text}</div>
      {hint && <div style={{ fontFamily: MONO, fontSize: 11, color: FG4, marginTop: 8 }}>{hint}</div>}
    </div>
  )
}

function TrackRow({
  index, track, active, playing, onPlay,
}: {
  index: number
  track: LocalTrack
  active: boolean
  playing: boolean
  onPlay: () => void
}) {
  const subtitle = [track.artist, track.album].filter(Boolean).join('  •  ')
  return (
    <button
      onClick={onPlay}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '9px 22px', background: active ? ACCENT_DIM : 'none',
        border: 'none', borderBottom: `1px solid ${BORDER2}`, cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{
        width: 22, flexShrink: 0, textAlign: 'right', fontFamily: MONO, fontSize: 11,
        color: active ? ACCENT : FG4,
      }}>
        {playing ? '▶' : index}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontFamily: SANS, fontSize: 13.5, color: active ? ACCENT : FG,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {track.title}
        </span>
        {subtitle && (
          <span style={{
            display: 'block', fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {subtitle}
          </span>
        )}
      </span>
      <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9.5, color: FG4, textTransform: 'uppercase' }}>
        {track.ext.replace('.', '')}
      </span>
    </button>
  )
}

function PlayerBar() {
  const lm = useLocalMusic()
  const t = lm.current
  if (!t) return null

  function scrub(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    lm.seek((e.clientX - rect.left) / rect.width)
  }

  return (
    <div style={{
      flexShrink: 0, borderTop: `1px solid ${BORDER}`, background: BG2,
      padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 18,
    }}>
      {/* Track info */}
      <div style={{ width: 220, flexShrink: 0, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, color: FG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.title}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.artist ?? t.album ?? 'Local file'}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <CtrlBtn onClick={lm.prev} title="Previous">⏮</CtrlBtn>
        <CtrlBtn onClick={lm.togglePlay} title={lm.isPlaying ? 'Pause' : 'Play'} primary>
          {lm.isPlaying ? '⏸' : '▶'}
        </CtrlBtn>
        <CtrlBtn onClick={lm.next} title="Next">⏭</CtrlBtn>
      </div>

      {/* Progress */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: FG3, width: 36, textAlign: 'right' }}>
          {fmtTime(lm.currentTime)}
        </span>
        <div
          onClick={scrub}
          style={{ flex: 1, height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <div style={{ position: 'relative', width: '100%', height: 3, background: BORDER, borderRadius: 2 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${lm.progress * 100}%`, background: ACCENT, borderRadius: 2 }} />
          </div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: FG3, width: 36 }}>
          {fmtTime(lm.duration)}
        </span>
      </div>
    </div>
  )
}

function CtrlBtn({
  children, onClick, title, primary,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: primary ? 34 : 28, height: primary ? 34 : 28, borderRadius: '50%',
        border: `1px solid ${primary ? ACCENT : BORDER}`,
        background: primary ? ACCENT : 'transparent',
        color: primary ? '#fff' : FG2,
        fontSize: primary ? 13 : 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  )
}
