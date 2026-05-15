/**
 * ContextBar.tsx
 *
 * Compact strip below the search bar. Three states:
 *   idle    — subtle prompt, text input on click
 *   loading — spinner while LLM parses intent
 *   active  — shows summary + bias chips + clear button
 */

import { useState, useRef, type KeyboardEvent } from 'react'
import type { AgentContext } from '../context/useAgentContext'

interface Props {
    context: AgentContext | null
    loading: boolean
    error?: string | null
    onActivate: (intent: string) => void
    onClear: () => void
}

// reuse existing SOND3R violet accent
const VIOLET = 'rgba(167,139,250,1)'
const VIOLET2 = 'rgba(167,139,250,0.7)'
const VIOLET3 = 'rgba(167,139,250,0.15)'
const VIOLET4 = 'rgba(167,139,250,0.07)'
const BORDER = 'rgba(167,139,250,0.18)'
const FG3 = 'var(--fg3, #a3a3a3)'

const CURVE_LABEL: Record<AgentContext['energyCurve'], string> = {
    'flat': '→',
    'build': '↑',
    'peak-and-drop': '↑↓',
}

export function ContextBar({ context, loading, error, onActivate, onClear }: Props) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const submit = () => {
        const trimmed = draft.trim()
        if (!trimmed) return
        onActivate(trimmed)
        setDraft('')
        setOpen(false)
    }

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') { setOpen(false); setDraft('') }
    }

    // ── active context ──────────────────────────────────────────────────────────
    if (context) {
        const allTags = [...context.moodBias, ...context.contextBias, ...context.genreBias]
        const curve = CURVE_LABEL[context.energyCurve]

        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: VIOLET4,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 11,
            }}>
                {/* pulse dot */}
                <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: VIOLET, boxShadow: `0 0 6px ${VIOLET}`,
                    animation: 'ctxPulse 2s ease-in-out infinite',
                }} />

                {/* summary */}
                <span style={{ color: VIOLET2, fontWeight: 500, flexShrink: 0 }}>
                    {context.summary}
                </span>

                {/* energy curve indicator */}
                <span style={{
                    color: VIOLET3, fontSize: 10, flexShrink: 0,
                    background: VIOLET3, padding: '1px 5px', borderRadius: 3,
                    border: `1px solid ${BORDER}`
                }}>
                    {curve}
                </span>

                {/* tag chips */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {allTags.slice(0, 6).map(tag => (
                        <span key={tag} style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 3,
                            background: VIOLET3, color: VIOLET2,
                            border: `1px solid ${BORDER}`,
                        }}>
                            {tag}
                        </span>
                    ))}
                    {allTags.length > 6 && (
                        <span style={{ fontSize: 10, color: FG3 }}>+{allTags.length - 6}</span>
                    )}
                </div>

                {/* clear */}
                <button
                    onClick={onClear}
                    title="Clear context"
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: FG3, fontSize: 13, padding: '0 2px',
                        opacity: 0.5, lineHeight: 1, flexShrink: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                >
                    ✕
                </button>

                <style>{`
          @keyframes ctxPulse {
            0%,100% { opacity: 0.5; transform: scale(1); }
            50%      { opacity: 1;   transform: scale(1.3); }
          }
        `}</style>
            </div>
        )
    }

    // ── loading ─────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: VIOLET4, border: `1px solid ${BORDER}`,
                borderRadius: 6, fontSize: 11, color: VIOLET2,
            }}>
                <span className="upload-spinner" style={{ width: 10, height: 10, borderWidth: 1.5, flexShrink: 0 }} />
                reading the room…
            </div>
        )
    }

    // ── input open ──────────────────────────────────────────────────────────────
    if (open) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px',
                background: VIOLET4, border: `1px solid ${BORDER}`,
                borderRadius: 6,
            }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>⚡</span>
                <input
                    ref={inputRef}
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="e.g. going for a jog, late night focus, cooking dinner…"
                    style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        color: 'var(--fg1, #fff)', fontSize: 11,
                        fontFamily: 'inherit', caretColor: VIOLET,
                    }}
                />
                <button
                    onClick={submit}
                    disabled={!draft.trim()}
                    style={{
                        background: draft.trim() ? VIOLET3 : 'none',
                        border: `1px solid ${draft.trim() ? BORDER : 'transparent'}`,
                        borderRadius: 4, color: VIOLET2, fontSize: 10,
                        letterSpacing: '0.06em', padding: '3px 10px',
                        cursor: draft.trim() ? 'pointer' : 'default',
                        opacity: draft.trim() ? 1 : 0.4,
                        fontFamily: 'inherit',
                    }}
                >
                    set
                </button>
                <button
                    onClick={() => { setOpen(false); setDraft('') }}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: FG3, fontSize: 12, padding: '0 2px', opacity: 0.5,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                >✕</button>
            </div>
        )
    }

    // ── idle prompt ─────────────────────────────────────────────────────────────
    return (
        <button
            onClick={() => setOpen(true)}
            style={{
                display: 'flex', alignItems: 'center', gap: 7,
                width: '100%', padding: '6px 10px', marginBottom: 10,
                background: 'none',
                border: `1px solid transparent`,
                borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                fontSize: 11, color: FG3, fontFamily: 'inherit',
                opacity: 0.55, transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.borderColor = BORDER
                e.currentTarget.style.background = VIOLET4
            }}
            onMouseLeave={e => {
                e.currentTarget.style.opacity = '0.55'
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.background = 'none'
            }}
        >
            <span style={{ fontSize: 13 }}>⚡</span>
            <span>what are you up to?</span>
            {error && (
                <span style={{ marginLeft: 'auto', color: '#f87171', fontSize: 10 }}>
                    {error}
                </span>
            )}
        </button>
    )
}

export default ContextBar