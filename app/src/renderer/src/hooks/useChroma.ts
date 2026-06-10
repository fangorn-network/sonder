import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Track } from '../types'
import { asTrack } from '../types'
import type { RecordVM } from '../domain/recordVM'
import { toRecordVM } from '../domain/recordVM'
import {
  fetchSchema, getCachedSchema, ensureSchemaFromHits, roleLabel,
  type SchemaInfo, type RoleMap,
} from '../domain/roles'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://127.0.0.1:8080'
const PAGE_SIZE = 20
const HEALTH_RETRY_MS = 2000
const HEALTH_MAX_ATTEMPTS = 20

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeHit(hit: any): RecordVM | null {
  if (!hit?.fields) return null
  const rm = getCachedSchema()?.roles ?? null
  return toRecordVM(hit, rm)
}

function dedup(records: RecordVM[]): RecordVM[] {
  const seen = new Map<string, RecordVM>()
  for (const r of records) if (!seen.has(r.identity)) seen.set(r.identity, r)
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
  // Generic surface
  records: RecordVM[]
  schema: SchemaInfo | null
  roleMap: RoleMap | null
  facets: Record<string, string[]>
  // Legacy music surface (derived; kept for not-yet-migrated views)
  tracks: Track[]
  allGenres: string[]
  allMoods: string[]
  allContexts: string[]
  allThemes: string[]
  // Controls
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
  applyKernelQuery: (embedding: number[], silent: boolean) => void
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
  const [records, setRecords] = useState<RecordVM[]>([])
  const [schema, setSchema] = useState<SchemaInfo | null>(getCachedSchema())
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

  // Facet vocabularies, keyed by the tag-role field name.
  const [facets, setFacets] = useState<Record<string, string[]>>({})

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

      // Ensure we have a role map before projecting (fallback infers from hits).
      if (!getCachedSchema() && hits.length) setSchema(ensureSchemaFromHits(hits))

      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as RecordVM[])
      const ordered = (initialLoad && !query && pageOffset === 0)
        ? shuffle(normalized)
        : normalized

      setRecords(prev => dedup(replace ? ordered : [...prev, ...ordered]))
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
          // Pull the authoritative schema (role map + facets) before the first page.
          const info = await fetchSchema(CHROMA_URL)
          if (cancelled) return
          if (info) { setSchema(info); setFacets(info.facets ?? {}) }
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


  // Build facet vocabularies from loaded records when the server didn't supply them.
  useEffect(() => {
    if (records.length === 0) return
    if (Object.keys(facets).length > 0) return
    const rm = getCachedSchema()?.roles
    const tagFields = rm?.tags ?? []
    if (!tagFields.length) return
    const acc: Record<string, Set<string>> = {}
    for (const f of tagFields) acc[f] = new Set()
    for (const r of records) for (const f of tagFields) for (const v of r.tagsByField[f] ?? []) acc[f].add(v)
    const out: Record<string, string[]> = {}
    for (const f of tagFields) out[f] = [...acc[f]].sort()
    setFacets(out)
  }, [records, facets])

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
      if (!getCachedSchema() && hits.length) setSchema(ensureSchemaFromHits(hits))
      const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as RecordVM[])
      setRecords(normalized)
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
    setRecords([])
    setLoading(false)
    setRetryTick(t => t + 1)
  }, [])

  // ── Derived legacy surface ──────────────────────────────────────────────────

  const roleMap = schema?.roles ?? getCachedSchema()?.roles ?? null
  const tracks = useMemo(() => records.map(asTrack), [records])

  // Map the music tag-role fields back to the named accessors older views expect.
  // For non-music datasets these are simply empty and those views aren't shown.
  const allGenres = facets['genres'] ?? []
  const allMoods = facets['moods'] ?? []
  const allContexts = facets['contexts'] ?? []
  const allThemes = facets['themes'] ?? []

  return {
    records, schema, roleMap, facets,
    tracks, allGenres, allMoods, allContexts, allThemes,
    loading, loadingMore, error, hasMore, loadMore,
    search, setSearch, applyKernelQuery,
    chromaReady, seeding, retryConnect,
  }
}

export { roleLabel }
