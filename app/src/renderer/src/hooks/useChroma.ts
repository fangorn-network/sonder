import { useState, useEffect, useCallback, useRef } from 'react'
import type { Track } from '../types'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'
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
  const arr = (key: string): string[] =>
    f[key] ? f[key].split(',').map((s: string) => s.trim()).filter(Boolean) : []

  const title = str('title') ?? str('name') ?? 'Unknown'
  const artist = str('artist') ?? (hit.owner?.slice(0, 8) + '…')

  return {
    id: hit.id,
    manifestStateId: hit.manifestCid,
    spotify_artist_id: str('spotify_artist_id'),
    spotify_track_id: str('spotify_track_id') ?? '',
    title,
    artist,
    year: num('year'),
    rank: num('rank'),
    duration_ms: num('duration_ms'),
    genres: arr('genres'),
    moods: arr('moods'),
    themes: arr('themes'),
    contexts: arr('contexts'),
    owner: hit.owner ?? '',
    datasourceName: hit.schemaId ?? '',
    name: str('name') ?? title,
    embedding: hit.embedding ?? undefined,
  } satisfies Track
}

function dedup(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) {
    const key = t.spotify_track_id || t.id
    if (!seen.has(key)) seen.set(key, t)
  }
  return Array.from(seen.values())
}

// ── api ───────────────────────────────────────────────────────────────────────

async function chromaSearch(query: string, nResults: number, offset: number): Promise<any[]> {
  const params = new URLSearchParams({
    q: query || 'music',
    n_results: String(nResults + offset),
  })
  const resp = await fetch(`${CHROMA_URL}/search?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  const data = await resp.json()
  return (data.results ?? []).slice(offset)
}

async function chromaSearchVector(embedding: number[], nResults = 100): Promise<any[]> {
  const resp = await fetch(`${CHROMA_URL}/search/vector`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedding, n_results: nResults }),
  })
  if (!resp.ok) throw new Error(`Chroma vector search error: ${resp.status}`)
  const data = await resp.json()
  return data.results ?? []
}

// ── hook ──────────────────────────────────────────────────────────────────────

export interface UseChromaOptions {
  genreFilter?: string
  moodFilter?: string
  contextFilter?: string
}

export interface UseChromaResult {
  tracks: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
  applyKernelQuery: (embedding: number[]) => void
  allGenres: string[]
  allMoods: string[]
  allContexts: string[]
}

export function useChroma({
  genreFilter,
  moodFilter,
  contextFilter,
}: UseChromaOptions = {}): UseChromaResult {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const [allGenres, setAllGenres] = useState<string[]>([])
  const [allMoods, setAllMoods] = useState<string[]>([])
  const [allContexts, setAllContexts] = useState<string[]>([])
  const knownGenres = useRef<Set<string>>(new Set())
  const knownMoods = useRef<Set<string>>(new Set())
  const knownContexts = useRef<Set<string>>(new Set())

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeQuery = useRef('')

  // When true, kernel results are showing — block fetchPage from overwriting
  // until the user explicitly searches or applies a filter.
  const kernelActiveRef = useRef(false)

  // Track whether the initial load has happened so we don't double-fetch.
  const initialLoadDoneRef = useRef(false)

  const accumulateTags = useCallback((newTracks: Track[]) => {
    let gd = false, md = false, cd = false
    for (const t of newTracks) {
      t.genres.forEach(g => { if (!knownGenres.current.has(g)) { knownGenres.current.add(g); gd = true } })
      t.moods.forEach(m => { if (!knownMoods.current.has(m)) { knownMoods.current.add(m); md = true } })
      t.contexts.forEach(c => { if (!knownContexts.current.has(c)) { knownContexts.current.add(c); cd = true } })
    }
    if (gd) setAllGenres(Array.from(knownGenres.current).sort())
    if (md) setAllMoods(Array.from(knownMoods.current).sort())
    if (cd) setAllContexts(Array.from(knownContexts.current).sort())
  }, [])

  const buildQuery = useCallback((text: string) => {
    const parts: string[] = []
    if (text.trim()) parts.push(text.trim())
    if (genreFilter && genreFilter !== 'all') parts.push(genreFilter)
    if (moodFilter && moodFilter !== 'all') parts.push(moodFilter)
    if (contextFilter && contextFilter !== 'all') parts.push(contextFilter)
    return parts.join(' ') || 'music'
  }, [genreFilter, moodFilter, contextFilter])

  const fetchPage = useCallback(async (query: string, pageOffset: number, replace: boolean) => {
    // Don't overwrite kernel results unless the user has explicitly triggered
    // a search or filter change (kernelActiveRef is cleared by those paths).
    if (kernelActiveRef.current && replace) return

    activeQuery.current = query
    replace ? setLoading(true) : setLoadingMore(true)
    try {
      const hits = await chromaSearch(query, PAGE_SIZE, pageOffset)
      if (activeQuery.current !== query) return
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      accumulateTags(normalized)
      setTracks(prev => dedup(replace ? normalized : [...prev, ...normalized]))
      setHasMore(hits.length === PAGE_SIZE)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      replace ? setLoading(false) : setLoadingMore(false)
    }
  }, [accumulateTags])

  // Initial load — runs once on mount
  useEffect(() => {
    if (initialLoadDoneRef.current) return
    initialLoadDoneRef.current = true
    fetchPage(buildQuery(''), 0, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Search debounce — fires when the user types or changes filters.
  // Clears kernelActiveRef so kernel results are replaced by explicit intent.
  useEffect(() => {
    // Skip on initial mount — initial load effect handles that
    if (!initialLoadDoneRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      kernelActiveRef.current = false  // user is searching/filtering, yield kernel
      setOffset(0)
      setHasMore(true)
      fetchPage(buildQuery(search), 0, true)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, buildQuery, fetchPage])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    // loadMore always works — kernel results + browse pages can coexist
    kernelActiveRef.current = false
    const next = offset + PAGE_SIZE
    setOffset(next)
    fetchPage(buildQuery(search), next, false)
  }, [loadingMore, hasMore, offset, search, fetchPage, buildQuery])

  const applyKernelQuery = useCallback(async (embedding: number[]) => {
    console.log('[kernel] applyKernelQuery called, embedding:', embedding.length)
    kernelActiveRef.current = true
    setLoading(true)
    setError(null)
    try {
      const hits = await chromaSearchVector(embedding, 100)
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      accumulateTags(normalized)
      setTracks(normalized)
      setHasMore(true)
      setOffset(0)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
      kernelActiveRef.current = false
    } finally {
      setLoading(false)
    }
  }, [accumulateTags])

  return {
    tracks, loading, loadingMore, error, hasMore, loadMore,
    search, setSearch, applyKernelQuery,
    allGenres, allMoods, allContexts,
  }
}