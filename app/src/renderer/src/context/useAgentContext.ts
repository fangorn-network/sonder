/**
 * useAgentContext.ts
 *
 * Converts free-text user intent ("going for a jog") into a structured
 * AgentContext via the existing Fangorn agent infrastructure.
 *
 * Accepts `sendMessage` from useFangornAgent so the caller controls the
 * agent instance — no second agent, no direct API calls, no API key needed here.
 *
 * Usage:
 *   const { sendMessage } = useFangornAgent()
 *   const agentContext   = useAgentContext(sendMessage, { moods, contexts, genres })
 */

import { useCallback, useState } from 'react'
import type { AgentMcpResult } from '../hooks/useFangornAgent'

// ─── types ────────────────────────────────────────────────────────────────────

export interface AgentContext {
  intent:      string                             // original user text
  summary:     string                             // agent one-liner, e.g. "high-energy run"
  moodBias:    string[]                           // moods to prefer
  contextBias: string[]                           // contexts to prefer
  genreBias:   string[]                           // genres to prefer (can be empty)
  kernelOverrides: {
    entropy?: number                             // 0.1 = focused, 0.6 = discovery
    sigma?:   number                             // tighter = more specific sound
  }
  energyCurve: 'flat' | 'build' | 'peak-and-drop'
  startedAt:   number                             // Date.now() for energy curve timing
}

export interface ContextHints {
  moods:    string[]
  contexts: string[]
  genres:   string[]
  themes:   string[]
}

type SendMessage = (
  message:   string,
  toolNames?: string[],
) => Promise<AgentMcpResult | null>

// ─── prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(intent: string, hints: ContextHints): string {
  return `You are a music context parser for a personalized music player.
The user has described what they're currently doing or how they feel.
Convert it into structured recommendation parameters.

Activity: "${intent}"

Available moods (use ONLY tags from this list):
${hints.moods.slice(0, 40).join(', ')}

Available contexts (use ONLY tags from this list):
${hints.contexts.slice(0, 30).join(', ')}

Available genres (use ONLY tags from this list, or leave array empty):
${hints.genres.slice(0, 40).join(', ')}

Available themes (use ONLY tags from this list, or leave array empty):
${hints.themes.slice(0, 40).join(', ')}

Return ONLY a valid JSON object — no explanation, no markdown fences:
{
  "summary": "3-5 word vibe description",
  "moodBias": ["mood1", "mood2"],
  "contextBias": ["context1"],
  "genreBias": [],
  "themeBias": ["theme1", "theme2"],
  "kernelOverrides": {
    "entropy": 0.3,
    "sigma": 0.3
  },
  "energyCurve": "flat"
}

Guidelines:
- entropy: 0.1 = stay in known territory (focus, comfort), 0.3 = normal, 0.6 = explore new sounds
- sigma: 0.15 = very specific sound, 0.3 = normal, 0.5 = wide variety
- energyCurve: flat = consistent energy, build = ramps up over time (warmup/run), peak-and-drop = high then wind down (workout + cooldown)
- Be selective: 2-4 tags per dimension is better than exhaustive lists
- Empty genreBias is fine — don't force genres if the activity is genre-agnostic`
}

// ─── parser ───────────────────────────────────────────────────────────────────

function parseResponse(raw: string, intent: string): AgentContext {
  // strip any accidental markdown fences
  const clean  = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)

  return {
    intent,
    summary:         String(parsed.summary         ?? intent),
    moodBias:        Array.isArray(parsed.moodBias)    ? parsed.moodBias    : [],
    contextBias:     Array.isArray(parsed.contextBias) ? parsed.contextBias : [],
    genreBias:       Array.isArray(parsed.genreBias)   ? parsed.genreBias   : [],
    kernelOverrides: parsed.kernelOverrides ?? {},
    energyCurve:     (['flat', 'build', 'peak-and-drop'] as const)
                       .includes(parsed.energyCurve)
                       ? parsed.energyCurve
                       : 'flat',
    startedAt: Date.now(),
  }
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useAgentContext(
  sendMessage: SendMessage,
  hints:       ContextHints,
) {
  const [context, setContext] = useState<AgentContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const activate = useCallback(async (intent: string) => {
    const trimmed = intent.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    try {
      const prompt = buildPrompt(trimmed, hints)

      // Pass empty toolNames → plain chat, no MCP tools invoked
      const result = await sendMessage(prompt, [])

      if (!result?.agentMessage) {
        throw new Error('Agent returned no response. Is it configured in the Agent tab?')
      }

      const ctx = parseResponse(result.agentMessage, trimmed)
      setContext(ctx)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Context parsing failed'
      console.error('[context]', e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [sendMessage, hints])

  const clear = useCallback(() => {
    setContext(null)
    setError(null)
  }, [])

  return { context, loading, error, activate, clear }
}