/**
 * useMediaSearch.ts
 *
 * Unified search across YouTube Music and SoundCloud.
 *
 * YouTube Music (ytmsearch:) is dramatically better than regular YouTube search
 * for music — it uses proper music metadata, Topic channels, and official uploads.
 * SoundCloud covers indie/underground/electronic that YT Music misses.
 *
 * Results are merged, scored, and deduplicated into a single ranked list.
 */

import { useCallback, useRef, useState } from 'react'
import type { Track } from '../types'

// ── Title cleaning ─────────────────────────────────────────────────────────────

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video)|lyrics?|hd|hq|mv|4k|visualizer|remaster(?:ed)?|explicit)[\)\]]/gi, '')
    .replace(/\s*-\s*(official\s*(video|audio|music\s*video)|lyrics?|hd|hq|remaster(?:ed)?)$/gi, '')
    .replace(/\s*\|\s*.+$/, '')
    .replace(/\s*[\(\[](?:20\d{2})[\)\]]/g, '') // strip year suffixes like (2019)
    .trim()
}

function cleanArtist(channel: string): string {
  return channel
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/_/g, ' ')
    .replace(/VEVO$/i, '')
    .trim()
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreResult(r: any, query: string, source: 'ytmusic' | 'yt' | 'sc'): number {
  const title   = (r.title ?? '').toLowerCase()
  const channel = (r.channel ?? r.uploader ?? '').toLowerCase()
  const q       = query.toLowerCase()
  const words   = q.split(/\s+/).filter(Boolean)

  let score = 0

  // Source quality
  if (source === 'ytmusic') score += 20
  if (source === 'sc')      score += 10

  // Topic channel = official artist upload on YT Music
  if (channel.includes('- topic')) score += 50

  // Official signals
  if (title.includes('official audio'))        score += 35
  if (title.includes('official music video'))  score += 25
  if (title.includes('official video'))        score += 20
  if (channel.includes('official'))            score += 15
  if (title.includes('official'))              score += 10
  if (title.includes('audio'))                 score += 8
  if (title.includes('lyrics'))                score += 5

  // Duration heuristic — songs are typically 1.5–8 min
  const dur = r.duration ?? 0
  if (dur > 90 && dur < 480)  score += 10
  if (dur > 480)               score -= 15  // likely a mix/album
  if (dur < 60 && dur > 0)    score -= 20  // likely a clip

  // Query word match in title — most important signal
  const matchCount = words.filter(w => title.includes(w)).length
  score += matchCount * 12

  // Penalise unwanted content
  if (title.includes('live') && !q.includes('live'))           score -= 35
  if (title.includes('concert') && !q.includes('concert'))     score -= 35
  if (title.includes('cover') && !q.includes('cover'))         score -= 30
  if (title.includes('reaction'))                               score -= 50
  if (title.includes('karaoke'))                                score -= 60
  if (title.includes('remix') && !q.includes('remix'))         score -= 20
  if (title.includes('acoustic') && !q.includes('acoustic'))   score -= 15
  if (title.includes('instrumental') && !q.includes('instr'))  score -= 15
  if (title.includes('tribute'))                                score -= 30
  if (title.includes('nightcore'))                              score -= 40

  return score
}

// ── SoundCloud source resolution ──────────────────────────────────────────────

function resolveScSource(r: any, title: string, artist: string): string {
  const wp = r.webpage_url ?? ''
  if (wp.startsWith('https://soundcloud.com/')) return wp
  const url = r.url ?? ''
  if (url.startsWith('https://soundcloud.com/')) return url
  // API URL fallback — use search string
  return artist ? `${title} ${artist}` : title
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedupKey(title: string, artist: string): string {
  return `${title.toLowerCase().replace(/\s+/g, '')}::${artist.toLowerCase().replace(/\s+/g, '')}`
}

// ── Track builders ────────────────────────────────────────────────────────────

interface ScoredTrack extends Track {
  _score: number
}

function fromYt(r: any, query: string, source: 'ytmusic' | 'yt'): ScoredTrack {
  const title  = cleanTitle(r.title ?? '')
  const artist = cleanArtist(r.channel ?? r.uploader ?? '')
  return {
    _score:        scoreResult(r, query, source),
    id:            `yt:${r.id}`,
    trackId:       `yt:${r.id}`,
    owner:         '',
    manifestCid:   '',
    title,
    artist,
    year:          r.upload_date ? parseInt(r.upload_date.slice(0, 4)) || null : null,
    durationMs:    r.duration ? Math.round(r.duration * 1000) : null,
    youtubeVideoId: r.id,
    thumbnailUrl:  r.thumbnail ?? undefined,
  }
}

function fromSc(r: any, query: string): ScoredTrack {
  const title  = cleanTitle(r.title ?? '')
  const artist = cleanArtist(r.uploader ?? r.channel ?? '')
  return {
    _score:        scoreResult(r, query, 'sc'),
    id:            `sc:${r.id}`,
    trackId:       `sc:${r.id}`,
    owner:         '',
    manifestCid:   '',
    title,
    artist,
    year:          r.upload_date ? parseInt(r.upload_date.slice(0, 4)) || null : null,
    durationMs:    r.duration ? Math.round(r.duration * 1000) : null,
    youtubeVideoId: resolveScSource(r, title, artist),
    thumbnailUrl:  r.thumbnail ?? undefined,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface MediaSearchResult {
  tracks:  Track[]
  loading: boolean
  search:  (query: string) => Promise<void>
  clear:   () => void
}

export function useMediaSearch(): MediaSearchResult {
  const [tracks, setTracks]   = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(false)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) return
    abortRef.current = false
    setLoading(true)
    setTracks([])

    try {
      // Run YouTube Music and SoundCloud in parallel
      const [ytResult, scResult] = await Promise.allSettled([
        (window as any).electron.ipcRenderer.invoke('yt:search:music', query) as Promise<any[]>,
        (window as any).electron.ipcRenderer.invoke('yt:search:sc', query)    as Promise<any[]>,
      ])

      if (abortRef.current) return

      const ytItems = ytResult.status === 'fulfilled' ? ytResult.value : []
      const scItems = scResult.status === 'fulfilled' ? scResult.value : []

      const scored: ScoredTrack[] = [
        ...ytItems.filter((r: any) => r.id && r.title).map((r: any) => fromYt(r, query, 'ytmusic')),
        ...scItems.filter((r: any) => r.title).map((r: any) => fromSc(r, query)),
      ]

      // Sort by score descending, then deduplicate by title+artist
      scored.sort((a, b) => b._score - a._score)

      const seen   = new Set<string>()
      const merged: Track[] = []
      for (const t of scored) {
        const key = dedupKey(t.title, t.artist)
        if (seen.has(key)) continue
        seen.add(key)
        const { _score, ...track } = t
        merged.push(track)
      }

      setTracks(merged)
    } catch (err) {
      console.error('[useMediaSearch] failed:', err)
    } finally {
      if (!abortRef.current) setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    abortRef.current = true
    setTracks([])
    setLoading(false)
  }, [])

  return { tracks, loading, search, clear }
}