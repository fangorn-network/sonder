import { useState, useEffect, useCallback, useRef } from 'react'
import type { Track } from '../types'

const CHROMA_URL = import.meta.env.VITE_CHROMA_URL ?? 'http://localhost:8080'
const PAGE_SIZE = 20

// ── normalization ─────────────────────────────────────────────────────────────

function parseDocument(doc: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const part of doc.split(' | ')) {
    const colon = part.indexOf(': ')
    if (colon === -1) continue
    fields[part.slice(0, colon).trim()] = part.slice(colon + 2).trim()
  }
  return fields
}

function normalizeHit(hit: any): Track | null {
  const f = parseDocument(hit.document ?? '')

  const str = (key: string): string | null => f[key] ?? null
  const num = (key: string): number | null => {
    const v = parseFloat(f[key] ?? '')
    return isNaN(v) ? null : v
  }
  // values are comma-separated strings: "pop, electropop, dance pop"
  const arr = (key: string): string[] =>
    f[key] ? f[key].split(',').map((s: string) => s.trim()).filter(Boolean) : []

  const title  = str('title') ?? str('name') ?? 'Unknown'
  const artist = str('artist') ?? (hit.owner?.slice(0, 8) + '…')

  return {
    id:              hit.id,
    manifestStateId: hit.manifestCid,
    mbid:            str('mbid'),
    title,
    artist,
    year:            num('year'),
    energy:          num('energy'),
    genres:          arr('genres'),
    moods:           arr('moods'),
    themes:          arr('themes'),
    contexts:        arr('contexts'),
    owner:           hit.owner ?? '',
    datasourceName:  hit.schemaId ?? '',
    name:            str('name') ?? title,
  } satisfies Track
}

function dedup(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) {
    const key = t.mbid ?? t.id
    if (!seen.has(key)) seen.set(key, t)
  }
  return Array.from(seen.values())
}

// ── api ───────────────────────────────────────────────────────────────────────

async function chromaSearch(query: string, nResults: number, offset: number): Promise<any[]> {
  const params = new URLSearchParams({
    q:         query || 'music',
    n_results: String(nResults + offset),
  })
  const resp = await fetch(`${CHROMA_URL}/search?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  const data = await resp.json()
  return (data.results ?? []).slice(offset)
}

// ── hook ──────────────────────────────────────────────────────────────────────

export interface UseChromaResult {
  tracks: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
}

export function useChroma(): UseChromaResult {
  const [tracks, setTracks]           = useState<Track[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [offset, setOffset]           = useState(0)
  const [hasMore, setHasMore]         = useState(true)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeQuery  = useRef('')

  const fetchPage = useCallback(async (query: string, pageOffset: number, replace: boolean) => {
    activeQuery.current = query
    replace ? setLoading(true) : setLoadingMore(true)
    try {
      const hits = await chromaSearch(query, PAGE_SIZE, pageOffset)
      if (activeQuery.current !== query) return
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      setTracks(prev => dedup(replace ? normalized : [...prev, ...normalized]))
      setHasMore(hits.length === PAGE_SIZE)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      replace ? setLoading(false) : setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchPage('', 0, true)
  }, [fetchPage])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setOffset(0)
      setHasMore(true)
      fetchPage(search.trim(), 0, true)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, fetchPage])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    const next = offset + PAGE_SIZE
    setOffset(next)
    fetchPage(search.trim(), next, false)
  }, [loadingMore, hasMore, offset, search, fetchPage])

  return { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch }
}