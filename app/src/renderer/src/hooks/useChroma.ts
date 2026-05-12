import { useState, useEffect, useCallback, useRef } from 'react'
import type { Track, JoinedRecord, FieldValue } from '../types'
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
  genreFilter?:   string
  moodFilter?:    string
  contextFilter?: string
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
  genreFilter   = 'all',
  moodFilter    = 'all',
  contextFilter = 'all',
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
  const offsetRef       = useRef(0)
  const activeQueryRef  = useRef('')
  const kernelActiveRef = useRef(false)
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { searchRef.current  = search },        [search])
  useEffect(() => { genreRef.current   = genreFilter },   [genreFilter])
  useEffect(() => { moodRef.current    = moodFilter },    [moodFilter])
  useEffect(() => { contextRef.current = contextFilter }, [contextFilter])

  const accumulateTags = useCallback((newTracks: Track[]) => {
    let gd = false, md = false, cd = false
    // for (const t of newTracks) {
    //   t.genres.forEach(g   => { if (!knownGenres.current.has(g))   { knownGenres.current.add(g);   gd = true } })
    //   t.moods.forEach(m    => { if (!knownMoods.current.has(m))    { knownMoods.current.add(m);    md = true } })
    //   t.contexts.forEach(c => { if (!knownContexts.current.has(c)) { knownContexts.current.add(c); cd = true } })
    // }
    // if (gd) setAllGenres(Array.from(knownGenres.current).sort())
    // if (md) setAllMoods(Array.from(knownMoods.current).sort())
    // if (cd) setAllContexts(Array.from(knownContexts.current).sort())
  }, [])

  const buildQuery = useCallback((text: string): string | null => {
    const parts: string[] = []
    if (text.trim()) parts.push(text.trim())
    if (genreRef.current   !== 'all') parts.push(genreRef.current)
    if (moodRef.current    !== 'all') parts.push(moodRef.current)
    if (contextRef.current !== 'all') parts.push(contextRef.current)
    return parts.length > 0 ? parts.join(' ') : null  // null = use /browse
  }, [])

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
  }, [search, genreFilter, moodFilter, contextFilter]) // eslint-disable-line react-hooks/exhaustive-deps

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