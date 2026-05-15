import { useState, useEffect, useCallback, useRef } from 'react'
import type { Track, JoinedRecord } from '../types'
import { asTrack } from '../types'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'
const PAGE_SIZE = 20
const HEALTH_RETRY_MS = 2000
const HEALTH_MAX_ATTEMPTS = 20

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeHit(hit: any): Track | null {
  if (!hit?.fields) return null
  const record: JoinedRecord = {
    id: hit.id,
    trackId: hit.trackId ?? hit.fields?.trackId ?? hit.id.replace(/^track:/, ''),
    owner: hit.owner ?? '',
    manifestCid: hit.manifestCid ?? '',
    fields: hit.fields,
    embedding: hit.embedding,
    score: hit.score,
    distance: hit.distance,
  }
  const track = asTrack(record)
  if (!track) return null

  return {
    ...track,
    genres: Array.isArray(hit.fields.genres) ? hit.fields.genres : [],
    moods: Array.isArray(hit.fields.moods) ? hit.fields.moods : [],
    themes: Array.isArray(hit.fields.themes) ? hit.fields.themes : [],
    contexts: Array.isArray(hit.fields.contexts) ? hit.fields.contexts : [],
  }
}

function dedup(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) {
    const key = t.spotifyTrackId || t.trackId
    if (!seen.has(key)) seen.set(key, t)
  }
  return Array.from(seen.values())
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type TagFilter = string | string[] | undefined

function resolveFilter(f: TagFilter): string[] {
  if (!f) return []
  if (Array.isArray(f)) return f.filter(v => v && v !== 'all')
  return f === 'all' ? [] : [f]
}

// ── api ───────────────────────────────────────────────────────────────────────

async function chromaHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${CHROMA_URL}/browse?limit=1`, {
      signal: AbortSignal.timeout(3000),
    })
    return resp.ok
  } catch {
    return false
  }
}

async function chromaBrowse(nResults: number, offset: number): Promise<any[]> {
  const params = new URLSearchParams({ limit: String(nResults), offset: String(offset) })
  const resp = await fetch(`${CHROMA_URL}/browse?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  return (await resp.json()).results ?? []
}

async function chromaSearch(query: string, nResults: number, offset: number): Promise<any[]> {
  const params = new URLSearchParams({ q: query, n_results: String(nResults + offset) })
  const resp = await fetch(`${CHROMA_URL}/search?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  return ((await resp.json()).results ?? []).slice(offset)
}

async function chromaSearchVector(embedding: number[], nResults = 100): Promise<any[]> {
  const resp = await fetch(`${CHROMA_URL}/search/vector`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedding, n_results: nResults }),
  })
  if (!resp.ok) throw new Error(`Chroma vector search error: ${resp.status}`)
  return (await resp.json()).results ?? []
}

// ── hook ──────────────────────────────────────────────────────────────────────

export interface UseChromaOptions {
  genreFilter?: TagFilter
  moodFilter?: TagFilter
  contextFilter?: TagFilter
  themeFilter?: TagFilter
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
  applyKernelQuery: (embedding: number[], silent: boolean) => void
  allGenres: string[]
  allMoods: string[]
  allContexts: string[]
  allThemes: string[]
  chromaReady: boolean
  seeding: boolean
  retryConnect: () => void
}

export function useChroma({
  genreFilter,
  moodFilter,
  contextFilter,
  themeFilter,
}: UseChromaOptions = {}): UseChromaResult {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [chromaReady, setChromaReady] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  const searchRef = useRef(search)
  const genreRef = useRef(genreFilter)
  const moodRef = useRef(moodFilter)
  const contextRef = useRef(contextFilter)
  const themeRef = useRef(themeFilter)
  const offsetRef = useRef(0)
  const activeQueryRef = useRef('')
  const kernelActiveRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyRef = useRef(false)

  const [allGenres, setAllGenres] = useState<string[]>([])
  const [allMoods, setAllMoods] = useState<string[]>([])
  const [allContexts, setAllContexts] = useState<string[]>([])
  const [allThemes, setAllThemes] = useState<string[]>([])

  useEffect(() => { searchRef.current = search }, [search])
  useEffect(() => { genreRef.current = genreFilter }, [genreFilter])
  useEffect(() => { moodRef.current = moodFilter }, [moodFilter])
  useEffect(() => { contextRef.current = contextFilter }, [contextFilter])
  useEffect(() => { themeRef.current = themeFilter }, [themeFilter])

  // ── Query builder ──────────────────────────────────────────────────────────

  const buildQuery = useCallback((text: string): string | null => {
    const parts: string[] = []
    if (text.trim()) parts.push(text.trim())
    resolveFilter(genreRef.current).forEach(v => parts.push(v))
    resolveFilter(moodRef.current).forEach(v => parts.push(v))
    resolveFilter(contextRef.current).forEach(v => parts.push(v))
    resolveFilter(themeRef.current).forEach(v => parts.push(v))
    return parts.length > 0 ? parts.join(' ') : null
  }, [])

  // ── Fetch page ────────────────────────────────────────────────────────────

  const fetchPage = useCallback(async (
    query: string | null,
    pageOffset: number,
    replace: boolean,
    initialLoad = false,
  ) => {
    if (kernelActiveRef.current && replace) return
    const queryKey = query ?? '__browse__'
    activeQueryRef.current = queryKey
    replace ? setLoading(true) : setLoadingMore(true)
    setError(null)
    try {
      const hits = query
        ? await chromaSearch(query, PAGE_SIZE, pageOffset)
        : await chromaBrowse(PAGE_SIZE, pageOffset)
      if (activeQueryRef.current !== queryKey) return

      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      const ordered = (initialLoad && !query && pageOffset === 0)
        ? shuffle(normalized)
        : normalized

      setTracks(prev => dedup(replace ? ordered : [...prev, ...ordered]))
      setHasMore(hits.length === PAGE_SIZE)
      offsetRef.current = pageOffset
    } catch (e: any) {
      if (activeQueryRef.current !== queryKey) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      replace ? setLoading(false) : setLoadingMore(false)
    }
  }, [])

  // ── Health check ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    const attempt = async () => {
      if (cancelled) return
      attempts++

      const ok = await chromaHealth()
      if (cancelled) return

      if (ok) {
        if (!readyRef.current) {
          readyRef.current = true
          setChromaReady(true)
          setError(null)
          fetchPage(buildQuery(''), 0, true, true)
        }
      } else if (attempts < HEALTH_MAX_ATTEMPTS) {
        setTimeout(attempt, HEALTH_RETRY_MS)
      } else {
        setLoading(false)
        setError('Cannot reach the catalog backend. Make sure the server is running.')
      }
    }

    attempt()
    return () => {
      cancelled = true
      readyRef.current = false  // ← the fix: state resets on remount, ref must too
    }
  }, [retryTick, fetchPage, buildQuery])

  // ── Re-fetch when search / filters change (only after chromaReady) ────────

  useEffect(() => {
    if (!readyRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      kernelActiveRef.current = false
      offsetRef.current = 0
      setHasMore(true)
      fetchPage(buildQuery(search), 0, true)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, genreFilter, moodFilter, contextFilter, themeFilter, fetchPage, buildQuery])


  // load genres, moods, and contexts
  useEffect(() => {
    if (tracks.length === 0) return
    const genres = new Set<string>()
    const moods = new Set<string>()
    const contexts = new Set<string>()
    const themes = new Set<string>()
    for (const t of tracks) {
      for (const g of (t as any).genres ?? []) genres.add(g)
      for (const m of (t as any).moods ?? []) moods.add(m)
      for (const c of (t as any).contexts ?? []) contexts.add(c)
      for (const th of (t as any).themes ?? []) themes.add(th)
    }
    setAllGenres([...genres].sort())
    setAllMoods([...moods].sort())
    setAllContexts([...contexts].sort())
    setAllThemes([...themes].sort())
  }, [tracks])

  // ── Load more ─────────────────────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    kernelActiveRef.current = false
    fetchPage(buildQuery(searchRef.current), offsetRef.current + PAGE_SIZE, false)
  }, [loadingMore, hasMore, fetchPage, buildQuery])

  // ── Kernel query ──────────────────────────────────────────────────────────

  const applyKernelQuery = useCallback(async (embedding: number[], silent = false) => {
    kernelActiveRef.current = true
    if (!silent) setSeeding(true)
    setSeeding(true)
    setError(null)
    try {
      const hits = await chromaSearchVector(embedding, 100)
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
      setTracks(normalized)
      setHasMore(true)
      offsetRef.current = 0
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
      kernelActiveRef.current = false
    } finally {
      setSeeding(false)
      if (!silent) setSeeding(false)
    }
  }, [])

  const retryConnect = useCallback(() => {
    readyRef.current = false
    setChromaReady(false)
    setError(null)
    setTracks([])
    setLoading(false)
    setRetryTick(t => t + 1)
  }, [])

  return {
    tracks, loading, loadingMore, error, hasMore, loadMore,
    search, setSearch, applyKernelQuery,
    allGenres, allMoods, allContexts, allThemes,
    chromaReady, seeding, retryConnect,
  }
}