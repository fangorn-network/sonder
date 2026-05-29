/**
 * KernelView.tsx
 *
 * Three tabs:
 *   geometry — genre radar + kernel spectrum
 *   history  — navigable play/skip timeline with entropy trace
 *   profiles — save / load / delete named profiles
 */

import { useCallback, useMemo, useState } from 'react'
import {
  type KernelSnapshot,
  loadKernels, upsertKernel, deleteKernel, newKernelId,
} from '../../types/kernel'
import type { SessionEvent } from '../../kernel/Visualizer'
import './KernelView.css'

export interface KernelViewProps {
  currentQueryVector:  Float32Array | null
  currentEntropy:      number
  currentGenreWeights: Record<string, number>
  sessionHistory:      SessionEvent[]
  onLoadKernel:       (snapshot: KernelSnapshot) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const d = Date.now() - ms
  const m = Math.floor(d / 60_000)
  const h = Math.floor(d / 3_600_000)
  const day = Math.floor(d / 86_400_000)
  if (m < 2)    return 'just now'
  if (m < 60)   return `${m}m ago`
  if (h < 24)   return `${h}h ago`
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}

function topGenres(weights: Record<string, number>, n = 8): [string, number][] {
  return Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, n)
}

// ─── Genre Radar ─────────────────────────────────────────────────────────────

function GenreRadar({ weights }: { weights: Record<string, number> }) {
  const genres = topGenres(weights, 8)
  if (genres.length < 3) {
    return <div className="kv-viz-empty">play more tracks to shape the genre radar</div>
  }
  const cx = 160, cy = 160, r = 110
  const maxW = Math.max(...genres.map(([, w]) => w), 1)
  const pts = genres.map(([name, weight], i) => {
    const angle = (i / genres.length) * Math.PI * 2 - Math.PI / 2
    const ratio = weight / maxW
    return {
      x:      cx + Math.cos(angle) * r * ratio,
      y:      cy + Math.sin(angle) * r * ratio,
      axisX:  cx + Math.cos(angle) * r,
      axisY:  cy + Math.sin(angle) * r,
      labelX: cx + Math.cos(angle) * (r + 28),
      labelY: cy + Math.sin(angle) * (r + 28),
      name, ratio,
    }
  })
  const polygon = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <svg viewBox="0 0 320 320" width="100%" style={{ maxWidth: 320 }}>
      {[0.25, 0.5, 0.75, 1.0].map(v => (
        <circle key={v} cx={cx} cy={cy} r={r * v} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      {pts.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.axisX.toFixed(1)} y2={p.axisY.toFixed(1)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      <polygon points={polygon} fill="rgba(0,255,231,0.08)" stroke="#00ffe7" strokeWidth="1.5" strokeOpacity="0.6" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3" fill="#00ffe7" opacity="0.7" />
      ))}
      {pts.map((p, i) => (
        <text key={i} x={p.labelX.toFixed(1)} y={p.labelY.toFixed(1)}
          textAnchor="middle" dominantBaseline="middle" fontSize="9" letterSpacing="0.06em"
          fill="rgba(255,255,255,0.45)" style={{ textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' }}
        >
          {p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name}
        </text>
      ))}
      <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.2)" />
    </svg>
  )
}

// ─── Kernel Spectrum ──────────────────────────────────────────────────────────

function KernelSpectrum({ vec }: { vec: Float32Array | null }) {
  if (!vec || vec.length === 0) return <div className="kv-viz-empty">no taste vector yet</div>
  const n = 64
  const size = Math.floor(vec.length / n)
  const buckets: number[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < size; j++) sum += Math.abs(vec[i * size + j])
    buckets.push(sum / size)
  }
  const max = Math.max(...buckets, 0.001)
  const normalized = buckets.map(v => v / max)
  const W = 600, H = 80
  const bw = W / n - 1

  return (
    <div>
      <div className="kv-viz-label">taste spectrum  ·  {vec.length} dims → 64 buckets</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {normalized.map((v, i) => {
          const barH = Math.max(2, v * H * 0.9)
          const hue = 180 - v * 120
          return (
            <rect key={i} x={i * (bw + 1)} y={H - barH} width={bw} height={barH}
              fill={`hsl(${hue},${60 + v * 40}%,55%)`} opacity={0.5 + v * 0.5} />
          )
        })}
      </svg>
    </div>
  )
}

// ─── Entropy Trace ────────────────────────────────────────────────────────────

function EntropyTrace({ history }: { history: SessionEvent[] }) {
  if (history.length < 2) return <div className="kv-viz-empty">need more session events</div>
  const W = 600, H = 60
  const pts = history.map((e, i) => ({
    x: (i / (history.length - 1)) * W,
    y: H - (e.entropySnapshot ?? 0) * H * 0.9,
    type: e.type,
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div>
      <div className="kv-viz-label">entropy trace  ·  {history.length} events</div>
      <svg viewBox={`0 0 ${W} ${H + 10}`} width="100%" style={{ display: 'block' }}>
        {[0.25, 0.5, 0.75].map(v => (
          <line key={v} x1={0} y1={H - v * H * 0.9} x2={W} y2={H - v * H * 0.9}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        <path d={pathD} fill="none" stroke="rgba(0,255,231,0.5)" strokeWidth="1.5" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5"
            fill={p.type === 'play' ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)'} />
        ))}
      </svg>
    </div>
  )
}

// ─── History Timeline ─────────────────────────────────────────────────────────

function HistoryTimeline({ history }: { history: SessionEvent[] }) {
  const reversed = [...history].reverse()
  if (reversed.length === 0) return <div className="kv-viz-empty">no session events yet</div>

  return (
    <div className="kv-timeline">
      {reversed.map((e, i) => (
        <div key={i} className={`kv-event kv-event--${e.type}`}>
          <div className="kv-event-marker" />
          <div className="kv-event-body">
            <div className="kv-event-track">
              <span className="kv-event-title">{e.trackTitle}</span>
              <span className="kv-event-artist">{e.artistId}</span>
            </div>
            <div className="kv-event-meta">
              <span className={`kv-event-badge kv-event-badge--${e.type}`}>{e.type}</span>
              <span className="kv-event-entropy">ε {(e.entropySnapshot ?? 0).toFixed(3)}</span>
              <span className="kv-event-time">{timeAgo(e.t)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

type Tab = 'geometry' | 'history' | 'kernels'

export function KernelView({
  currentQueryVector,
  currentEntropy,
  currentGenreWeights,
  sessionHistory,
  onLoadKernel,
}: KernelViewProps) {
  const [tab,        setTab]        = useState<Tab>('geometry')
  const [kernels,   setKernels]   = useState<KernelSnapshot[]>(() => loadKernels())
  const [saveName,   setSaveName]   = useState('')
  const [saveTags,   setSaveTags]   = useState('')
  const [saveDesc,   setSaveDesc]   = useState('')
  const [newName,    setNewName]    = useState('')
  const [newCreated, setNewCreated] = useState(false)
  const [loadedId,   setLoadedId]   = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [expanded,   setExpanded]   = useState<string | null>(null)

  const playCount = useMemo(() => sessionHistory.filter(e => e.type === 'play').length, [sessionHistory])
  const skipCount = useMemo(() => sessionHistory.filter(e => e.type === 'skip').length, [sessionHistory])
  const hasVector = !!(currentQueryVector && currentQueryVector.length > 0)
  const genres    = topGenres(currentGenreWeights)

  const handleSave = useCallback(() => {
    if (!saveName.trim() || !hasVector) return
    const snap: KernelSnapshot = {
      id:           newKernelId(),
      name:         saveName.trim(),
      description:  saveDesc.trim() || undefined,
      tags:         saveTags.split(',').map(t => t.trim()).filter(Boolean),
      queryVector:  Array.from(currentQueryVector!),
      entropy:      currentEntropy,
      genreWeights: { ...currentGenreWeights },
      playCount, skipCount,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    }
    setKernels(upsertKernel(snap))
    setSaveName(''); setSaveTags(''); setSaveDesc('')
  }, [saveName, saveTags, saveDesc, hasVector, currentQueryVector, currentEntropy, currentGenreWeights, playCount, skipCount])

  const handleCreateNew = useCallback(() => {
    if (!newName.trim()) return
    const snap: KernelSnapshot = {
      id:           newKernelId(),
      name:         newName.trim(),
      tags:         [],
      queryVector:  [],
      entropy:      0.2,
      genreWeights: {},
      playCount: 0, skipCount: 0,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    }
    setKernels(upsertKernel(snap))
    setLoadedId(snap.id)
    onLoadKernel(snap)
    setNewName('')
    setNewCreated(true)
    setTimeout(() => setNewCreated(false), 2000)
  }, [newName, onLoadKernel])

  const handleLoad = useCallback((snap: KernelSnapshot) => {
    onLoadKernel(snap)
    setLoadedId(snap.id)
  }, [onLoadKernel])

  const handleDelete = useCallback((id: string) => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setKernels(deleteKernel(id))
    setConfirmDel(null)
    if (loadedId === id) setLoadedId(null)
  }, [confirmDel, loadedId])

  const handleUpdate = useCallback((snap: KernelSnapshot) => {
    if (!hasVector) return
    setKernels(upsertKernel({
      ...snap,
      queryVector:  Array.from(currentQueryVector!),
      entropy:      currentEntropy,
      genreWeights: { ...currentGenreWeights },
      playCount:    snap.playCount + playCount,
      skipCount:    snap.skipCount + skipCount,
      updatedAt:    Date.now(),
    }))
  }, [hasVector, currentQueryVector, currentEntropy, currentGenreWeights, playCount, skipCount])

  return (
    <div className="kv-root">

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="kv-tabs">
        {((['geometry', 'history', 'kernels'] as Tab[])).map(t => (
          <button key={t} className={`kv-tab ${tab === t ? 'kv-tab--active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <div className="kv-tab-stats">
          <span>{playCount} plays</span>
          <span>·</span>
          <span>{skipCount} skips</span>
          <span>·</span>
          <span>ε {currentEntropy.toFixed(2)}</span>
        </div>
      </div>

      {/* ── Geometry tab ───────────────────────────────────────────────── */}
      {tab === 'geometry' && (
        <div className="kv-geometry">
          <div className="kv-geo-row">
            <div className="kv-geo-panel">
              <div className="kv-viz-label">genre topology</div>
              <GenreRadar weights={currentGenreWeights} />
              {genres.length > 0 && (
                <div className="kv-geo-legend">
                  {genres.slice(0, 4).map(([name, w]) => (
                    <div key={name} className="kv-legend-row">
                      <span className="kv-legend-name">{name}</span>
                      <div className="kv-legend-bar-wrap">
                        <div className="kv-legend-bar" style={{ width: `${(w / genres[0][1]) * 100}%` }} />
                      </div>
                      <span className="kv-legend-val">{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="kv-geo-panel kv-geo-panel--right">
              <KernelSpectrum vec={currentQueryVector} />
              <div style={{ marginTop: 24 }}>
                <EntropyTrace history={sessionHistory} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── History tab ────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="kv-history">
          <HistoryTimeline history={sessionHistory} />
        </div>
      )}

      {/* ── Profiles tab ───────────────────────────────────────────────── */}
      {tab === 'kernels' && (
        <div className="kv-manage">

          {/* what is a profile */}
          <div className="kv-explainer">
            <strong>Profiles shape what SOND3R recommends to you.</strong> Each profile learns from what you play and skip — like a playlist that gets smarter over time. Switch profiles to change your listening context: working, working out, unwinding, exploring something new.
          </div>

          {/* new profile — clean slate */}
          <section className="kv-new">
            <div className="kv-section-label">start a new profile</div>
            <div className="kv-new-body">
              <p className="kv-new-desc">
                give it a name, activate it, and start playing — SOND3R will learn your taste from scratch for this context.
              </p>
              <div className="kv-save-row">
                <input
                  className="kv-input kv-input--name"
                  placeholder="e.g.  late night,  workout,  focus,  road trip"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateNew()}
                  maxLength={48}
                />
                <button className="kv-btn kv-btn--new" onClick={handleCreateNew} disabled={!newName.trim()}>
                  {newCreated ? '✓ activated' : 'create + activate'}
                </button>
              </div>
            </div>
          </section>

          {/* save current as a profile */}
          <section className="kv-save">
            <div className="kv-section-label">save current session as a profile</div>
            <div className="kv-save-form">
              <input className="kv-input kv-input--name"
                placeholder="profile name"
                value={saveName} onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()} maxLength={48} />
              <input className="kv-input"
                placeholder="tags  (optional, comma separated:  dark,  chill,  hype)"
                value={saveTags} onChange={e => setSaveTags(e.target.value)} />
              <div className="kv-save-row">
                <input className="kv-input"
                  placeholder="notes  (optional)"
                  value={saveDesc} onChange={e => setSaveDesc(e.target.value)} maxLength={120} />
                <button className="kv-btn kv-btn--save" onClick={handleSave}
                  disabled={!saveName.trim() || !hasVector}>save</button>
              </div>
              {!hasVector && (
                <div className="kv-hint">
                  play a few songs first — SOND3R needs some listening history to save a profile.
                </div>
              )}
            </div>
          </section>

          {/* profile list */}
          <section className="kv-list">
            <div className="kv-section-label">
              your kernels <span className="kv-count">{kernels.length}</span>
            </div>

            {kernels.length === 0 && (
              <div className="kv-empty">no profiles yet — create one above to get started.</div>
            )}

            {kernels.map(k => {
              const isLoaded   = loadedId === k.id
              const isExpanded = expanded === k.id
              const isDeleting = confirmDel === k.id

              return (
                <div key={k.id} className={`kv-card ${isLoaded ? 'kv-card--loaded' : ''}`}>
                  <div className="kv-card-header">
                    <div className="kv-card-left">
                      {isLoaded && <span className="kv-loaded-dot" />}
                      <span className="kv-card-name">{k.name}</span>
                      {k.tags.length > 0 && (
                        <div className="kv-chip-row">
                          {k.tags.slice(0, 3).map(t => <span key={t} className="kv-chip">{t}</span>)}
                          {k.tags.length > 3 && <span className="kv-chip kv-chip--overflow">+{k.tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div className="kv-card-actions">
                      <button className="kv-btn kv-btn--ghost" onClick={() => setExpanded(isExpanded ? null : k.id)}>
                        {isExpanded ? '↑' : '↓'}
                      </button>
                      <button className="kv-btn kv-btn--load" onClick={() => handleLoad(k)} disabled={isLoaded}>
                        {isLoaded ? '● active' : 'activate'}
                      </button>
                      {isLoaded && (
                        <button className="kv-btn kv-btn--update" onClick={() => handleUpdate(k)} title="Save your current listening history into this profile">
                          save progress
                        </button>
                      )}
                      <button
                        className={`kv-btn ${isDeleting ? 'kv-btn--confirm' : 'kv-btn--del'}`}
                        onClick={() => handleDelete(k.id)} onBlur={() => setConfirmDel(null)}
                      >{isDeleting ? 'sure?' : '✕'}</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="kv-card-detail">
                      {k.description && <div className="kv-card-desc">{k.description}</div>}
                      <div className="kv-detail-stats">
                        <span>entropy {k.entropy.toFixed(2)}</span>
                        <span>·</span>
                        <span>{k.playCount} plays · {k.skipCount} skips</span>
                        <span>·</span>
                        <span>saved {timeAgo(k.createdAt)}</span>
                      </div>
                      {Object.keys(k.genreWeights).length > 0 && (
                        <div className="kv-genre-chips" style={{ marginTop: 8 }}>
                          {topGenres(k.genreWeights, 5).map(([g]) => (
                            <span key={g} className="kv-chip kv-chip--genre">{g}</span>
                          ))}
                        </div>
                      )}
                      <button className="kv-btn kv-btn--publish" disabled>
                        <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M6 8V2M3 5l3-3 3 3M2 10h8" />
                        </svg>
                        publish to fangorn
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        </div>
      )}
    </div>
  )
}