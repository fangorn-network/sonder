import { useState, useEffect, useCallback, useRef } from 'react'
import type { Track, JoinedRecord } from '../types'
import { asTrack } from '../types'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'
const PAGE_SIZE = 20

// ── normalization ─────────────────────────────────────────────────────────────

function normalizeHit(hit: any): Track | null {
  if (!hit?.fields) return null
  const record: JoinedRecord = {
    id:          hit.id,
    trackId:     hit.trackId  ?? hit.fields?.trackId ?? hit.id,
    owner:       hit.owner    ?? '',
    manifestCid: hit.manifestCid ?? '',
    fields:      hit.fields,
    embedding:   hit.embedding,
    score:       hit.score,
    distance:    hit.distance,
  }
  return asTrack(record)
}

function dedup(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) {
    const key = t.spotifyTrackId || t.trackId
    if (!seen.has(key)) seen.set(key, t)
  }
  return Array.from(seen.values())
}

// ── tag filter helpers ────────────────────────────────────────────────────────

type TagFilter = string | string[] | undefined

/** Normalise a TagFilter to a string[] ready for query building */
function resolveFilter(f: TagFilter): string[] {
  if (!f) return []
  if (Array.isArray(f)) return f.filter(v => v && v !== 'all')
  return f === 'all' ? [] : [f]
}

// ── api ───────────────────────────────────────────────────────────────────────

async function chromaBrowse(nResults: number, offset: number): Promise<any[]> {
  const params = new URLSearchParams({ limit: String(nResults), offset: String(offset) })
  const resp = await fetch(`${CHROMA_URL}/browse?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  const data = await resp.json()
  return data.results ?? []
}

async function chromaSearch(query: string, nResults: number, offset: number): Promise<any[]> {
  const params = new URLSearchParams({ q: query, n_results: String(nResults + offset) })
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
  /** Any of these can be a single value 'rock' or an array ['rock', 'metal'] or 'all'/undefined to skip */
  genreFilter?:   TagFilter
  moodFilter?:    TagFilter
  contextFilter?: TagFilter
  themeFilter?:   TagFilter
}

export interface UseChromaResult {
  tracks:           Track[]
  loading:          boolean
  loadingMore:      boolean
  error:            string | null
  hasMore:          boolean
  loadMore:         () => void
  search:           string
  setSearch:        (s: string) => void
  applyKernelQuery: (embedding: number[]) => void
  allGenres:        string[]
  allMoods:         string[]
  allContexts:      string[]
}

export function useChroma({
  genreFilter,
  moodFilter,
  contextFilter,
  themeFilter,
}: UseChromaOptions = {}): UseChromaResult {
  const [tracks,      setTracks]      = useState<Track[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [search,      setSearch]      = useState('')
  const [hasMore,     setHasMore]     = useState(true)

  const [allGenres,   setAllGenres]   = useState<string[]>([])
  const [allMoods,    setAllMoods]    = useState<string[]>([])
  const [allContexts, setAllContexts] = useState<string[]>([])
  const knownGenres   = useRef<Set<string>>(new Set())
  const knownMoods    = useRef<Set<string>>(new Set())
  const knownContexts = useRef<Set<string>>(new Set())

  const searchRef       = useRef(search)
  const genreRef        = useRef(genreFilter)
  const moodRef         = useRef(moodFilter)
  const contextRef      = useRef(contextFilter)
  const themeRef        = useRef(themeFilter)
  const offsetRef       = useRef(0)
  const activeQueryRef  = useRef('')
  const kernelActiveRef = useRef(false)
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { searchRef.current  = search        }, [search])
  useEffect(() => { genreRef.current   = genreFilter   }, [genreFilter])
  useEffect(() => { moodRef.current    = moodFilter    }, [moodFilter])
  useEffect(() => { contextRef.current = contextFilter }, [contextFilter])
  useEffect(() => { themeRef.current   = themeFilter   }, [themeFilter])

  const accumulateTags = useCallback((newTracks: Track[]) => {
    // tag accumulation wired up when Track type exposes genre/mood/context arrays
  }, [])

  // ── query builder ─────────────────────────────────────────────────────────
  // Flattens all active tag filters + freetext search into a single string.
  // Returns null when nothing is active → falls back to /browse.

  const buildQuery = useCallback((text: string): string | null => {
    const parts: string[] = []

    if (text.trim()) parts.push(text.trim())

    resolveFilter(genreRef.current).forEach(v   => parts.push(v))
    resolveFilter(moodRef.current).forEach(v    => parts.push(v))
    resolveFilter(contextRef.current).forEach(v => parts.push(v))
    resolveFilter(themeRef.current).forEach(v   => parts.push(v))

    return parts.length > 0 ? parts.join(' ') : null
  }, [])

  // ── fetch ─────────────────────────────────────────────────────────────────

  const fetchPage = useCallback(async (
    query: string | null,
    pageOffset: number,
    replace: boolean,
  ) => {
    if (kernelActiveRef.current && replace) return
    const queryKey = query ?? '__browse__'
    activeQueryRef.current = queryKey
    replace ? setLoading(true) : setLoadingMore(true)
    try {
      const hits = query
        ? await chromaSearch(query, PAGE_SIZE, pageOffset)
        : await chromaBrowse(PAGE_SIZE, pageOffset)
      if (activeQueryRef.current !== queryKey) return
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      accumulateTags(normalized)
      setTracks(prev => dedup(replace ? normalized : [...prev, ...normalized]))
      setHasMore(hits.length === PAGE_SIZE)
      offsetRef.current = pageOffset
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      replace ? setLoading(false) : setLoadingMore(false)
    }
  }, [accumulateTags, buildQuery])

  // Re-fetch whenever search text or any filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const isMount = activeQueryRef.current === ''
    const delay   = isMount ? 0 : 350
    debounceRef.current = setTimeout(() => {
      kernelActiveRef.current = false
      offsetRef.current = 0
      setHasMore(true)
      fetchPage(buildQuery(search), 0, true)
    }, delay)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, genreFilter, moodFilter, contextFilter, themeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    kernelActiveRef.current = false
    const next = offsetRef.current + PAGE_SIZE
    fetchPage(buildQuery(searchRef.current), next, false)
  }, [loadingMore, hasMore, fetchPage, buildQuery])

  const applyKernelQuery = useCallback(async (embedding: number[]) => {
    kernelActiveRef.current = true
    setLoading(true)
    setError(null)
    try {
      const hits       = await chromaSearchVector(embedding, 100)
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      accumulateTags(normalized)
      setTracks(normalized)
      setHasMore(true)
      offsetRef.current = 0
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