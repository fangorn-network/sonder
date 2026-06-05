/**
 * roles.ts — schema-agnostic semantic role inference (renderer side).
 *
 * The authoritative inference runs in the Python server (`vectordb/roles.py`)
 * and is served at `GET /schema`. This module:
 *   1. fetches + caches that RoleMap, and
 *   2. provides a faithful TypeScript twin of the heuristic as a fallback when
 *      the server is unreachable, so the UI can still render generically.
 *
 * Keep the synonym tables / type rules in sync with `vectordb/roles.py`.
 */

export type Role =
  | 'identity' | 'title' | 'subtitle' | 'temporal' | 'spatial' | 'media'
  | 'tags' | 'measures' | 'relations' | 'text'

export interface RoleMap {
  identity:  string | null
  title:     string | null
  subtitle:  string | null
  temporal:  string | null
  spatial:   string | null
  media:     string | null
  tags:      string[]
  measures:  string[]
  relations: string[]
  text:      string[]
  labels:    Record<string, string>
  fields?:   string[]
}

export interface SchemaInfo {
  roles:       RoleMap
  labels:      Record<string, string>
  facets:      Record<string, string[]>
  primary_tag: string | null
}

export const SINGULAR_ROLES: Role[] = ['identity', 'title', 'subtitle', 'temporal', 'spatial', 'media']
export const MULTI_ROLES:    Role[] = ['tags', 'measures', 'relations', 'text']

// ── Spec (mirror of roles.py) ───────────────────────────────────────────────

const ROLE_SYNONYMS: Record<Role, string[]> = {
  identity:  ['id', 'trackid', 'changesetid', 'contentid', 'uid', 'guid', 'key', 'recordid', 'hash', 'leaf', 'nullifier'],
  title:     ['title', 'name', 'label', 'headline', 'subject'],
  subtitle:  ['byartist', 'artist', 'author', 'creator', 'user', 'userid', 'owner', 'by', 'publisher', 'maker', 'contributor', 'channel'],
  tags:      ['genres', 'genre', 'moods', 'mood', 'themes', 'theme', 'contexts', 'context', 'tags', 'tag', 'categories', 'category', 'keywords', 'topics', 'labels'],
  temporal:  ['datepublished', 'date', 'createdat', 'created', 'timestamp', 'time', 'datetime', 'publishedat', 'updatedat', 'year', 'modified'],
  spatial:   ['bbox', 'boundingbox', 'bounds', 'geo', 'location', 'coordinates', 'latlon', 'lat', 'lon', 'lng', 'latitude', 'longitude', 'point', 'geometry', 'place'],
  measures:  ['duration', 'durationms', 'length', 'count', 'numchanges', 'size', 'score', 'amount', 'quantity', 'votes', 'plays', 'views', 'rank', 'weight'],
  media:     ['audio', 'media', 'url', 'uri', 'handle', 'src', 'source', 'platformid', 'videoid', 'contenturl', 'stream', 'embed', 'file', 'asset'],
  relations: ['album', 'albumname', 'release', 'releasegroup', 'group', 'collection', 'parent', 'set', 'series', 'playlist'],
  text:      ['description', 'comment', 'bio', 'notes', 'body', 'content', 'abstract', 'review', 'summary', 'message'],
}

const SINGULAR_PRIORITY: Role[] = ['identity', 'media', 'spatial', 'temporal', 'title', 'subtitle']
const DENYLIST = new Set(['schemaversion', 'mbid', '_mbid', 'datacid', 'manifestcid', 'namehash', 'blocktimestamp', 'version', 'owner'])

const STRONG = 3.0, WEAK = 1.5, THRESHOLD = 1.5, LONG_TEXT = 120
const DATE_RE = /^\s*\d{4}(-\d{2}(-\d{2})?)?([T ]\d{2}:\d{2})?/
const GEO_KEYS = new Set(['lat', 'lon', 'lng', 'latitude', 'longitude', 'min_lon', 'min_lat', 'max_lon', 'max_lat', 'x', 'y'])

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function nameScore(n: string, role: Role): number {
  let best = 0
  for (const syn of ROLE_SYNONYMS[role]) {
    if (n === syn) return STRONG
    if (syn.length >= 4 && n.length >= 4 && (n.includes(syn) || syn.includes(n))) best = Math.max(best, WEAK)
  }
  return best
}

interface Shape { arrayStr: boolean; number: boolean; date: boolean; geo: boolean; url: boolean; string: boolean; longText: boolean }

function looksUrl(v: unknown): boolean {
  return typeof v === 'string' && /^(https?:|ipfs:|spotify:|[a-z]+:\/\/)/i.test(v.trim())
}
function looksGeo(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v as object).some(k => GEO_KEYS.has(k.toLowerCase()))
}

function fieldShape(values: unknown[]): Shape {
  const n = values.length
  if (n === 0) return { arrayStr: false, number: false, date: false, geo: false, url: false, string: false, longText: false }
  let arr = 0, num = 0, date = 0, geo = 0, url = 0, str = 0, totalLen = 0, strN = 0
  for (const v of values) {
    if (Array.isArray(v)) { if (v.length && v.every(x => typeof x === 'string')) arr++ }
    else if (typeof v === 'boolean') { /* skip */ }
    else if (typeof v === 'number') num++
    else if (typeof v === 'string') {
      str++; strN++; totalLen += v.length
      if (DATE_RE.test(v)) date++
      if (looksUrl(v)) url++
    } else if (looksGeo(v)) geo++
  }
  const half = n / 2
  return {
    arrayStr: arr >= half && arr > 0,
    number:   num >= half && num > 0,
    date:     date >= half && date > 0,
    geo:      geo >= half && geo > 0,
    url:      url >= half && url > 0,
    string:   str >= half && str > 0,
    longText: (strN ? totalLen / strN : 0) >= LONG_TEXT,
  }
}

const TYPE_BONUS: Partial<Record<Role, [keyof Shape, number]>> = {
  tags: ['arrayStr', 2.0], measures: ['number', 1.5], temporal: ['date', 2.0],
  spatial: ['geo', 2.5], media: ['url', 1.5], text: ['longText', 2.0],
}

function roleScores(n: string, shape: Shape): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {}
  for (const role of Object.keys(ROLE_SYNONYMS) as Role[]) {
    let s = nameScore(n, role)
    const b = TYPE_BONUS[role]
    if (b && shape[b[0]]) s += b[1]
    if ((role === 'identity' || role === 'title' || role === 'subtitle') && shape.string && !shape.longText) s += 0.5
    if (s > 0) out[role] = s
  }
  return out
}

/** Faithful twin of roles.infer_roles — fallback when /schema is unavailable. */
export function inferRoles(records: Array<Record<string, unknown>>): RoleMap {
  const valuesByField = new Map<string, unknown[]>()
  for (const rec of records.slice(0, 500)) {
    if (!rec || typeof rec !== 'object') continue
    for (const [k, v] of Object.entries(rec)) {
      if (v == null) continue
      if (!valuesByField.has(k)) valuesByField.set(k, [])
      const arr = valuesByField.get(k)!
      if (arr.length < 50) arr.push(v)
    }
  }
  const fields = [...valuesByField.keys()].sort()
  const shapes = new Map<string, Shape>()
  const scores = new Map<string, Partial<Record<Role, number>>>()
  for (const f of fields) {
    if (DENYLIST.has(norm(f))) continue
    const sh = fieldShape(valuesByField.get(f)!)
    shapes.set(f, sh)
    scores.set(f, roleScores(norm(f), sh))
  }

  const rm: RoleMap = {
    identity: null, title: null, subtitle: null, temporal: null, spatial: null, media: null,
    tags: [], measures: [], relations: [], text: [], labels: {}, fields,
  }
  const used = new Set<string>()

  // tags
  for (const f of fields) {
    if (used.has(f) || !scores.has(f)) continue
    if (shapes.get(f)!.arrayStr && (scores.get(f)!.tags ?? 0) >= THRESHOLD) { rm.tags.push(f); used.add(f) }
  }
  const distinct = (f: string) => {
    const s = new Set<string>()
    for (const v of valuesByField.get(f) ?? []) if (Array.isArray(v)) v.forEach(x => s.add(String(x)))
    return s.size
  }
  rm.tags.sort((a, b) => distinct(b) - distinct(a) || a.localeCompare(b))

  // singular
  for (const role of SINGULAR_PRIORITY) {
    let bestF: string | null = null, bestS = THRESHOLD - 0.001
    for (const f of fields) {
      if (used.has(f) || !scores.has(f)) continue
      const s = scores.get(f)![role] ?? 0
      if (s > bestS) { bestF = f; bestS = s }
    }
    if (bestF) { (rm as unknown as Record<string, unknown>)[role] = bestF; used.add(bestF) }
  }

  // multi remainder
  for (const f of fields) {
    if (used.has(f) || !scores.has(f)) continue
    const sc = scores.get(f)!, sh = shapes.get(f)!
    if (sh.number && (sc.measures ?? 0) >= THRESHOLD) { rm.measures.push(f); used.add(f); continue }
    if ((sc.relations ?? 0) >= STRONG) { rm.relations.push(f); used.add(f); continue }
    if (sh.longText || (sc.text ?? 0) >= STRONG) { rm.text.push(f); used.add(f); continue }
  }

  for (const role of SINGULAR_ROLES) {
    const f = rm[role] as string | null
    if (f) rm.labels[role] = fieldLabel(f, true)
  }
  for (const role of MULTI_ROLES) {
    const fs = rm[role] as string[]
    if (fs.length) rm.labels[role] = fs.map(f => fieldLabel(f)).join(', ')
  }
  return rm
}

// ── Labels ──────────────────────────────────────────────────────────────────

const SINGULARIZE: Array<[string, string]> = [['ies', 'y'], ['ses', 's'], ['s', '']]

/** `byArtist` -> "Artist", `user_id` -> "User", `num_changes` -> "Num Changes". */
export function fieldLabel(name: string, singular = false): string {
  if (!name) return ''
  let raw = name.replace(/^by(?=[A-Z_])/, '')
  raw = raw.replace(/(_id|Id)$/, '') || raw
  let parts = raw.replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ').replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean)
  if (!parts.length) parts = [name]
  if (singular) {
    const last = parts[parts.length - 1].toLowerCase()
    for (const [suf, rep] of SINGULARIZE) {
      if (last.endsWith(suf) && last.length > suf.length + 1) {
        parts[parts.length - 1] = parts[parts.length - 1].slice(0, -suf.length) + rep
        break
      }
    }
  }
  return parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const DEFAULT_LABELS: Record<Role, string> = {
  identity: 'ID', title: 'Title', subtitle: 'By', temporal: 'Date', spatial: 'Location',
  media: 'Media', tags: 'Tags', measures: 'Stats', relations: 'Related', text: 'Notes',
}

/** Human label for a role given the active RoleMap (falls back to a generic word). */
export function roleLabel(roleMap: RoleMap | null, role: Role): string {
  return roleMap?.labels?.[role] || DEFAULT_LABELS[role]
}

// ── /schema client (cached) ─────────────────────────────────────────────────

let cached: SchemaInfo | null = null
let inflight: Promise<SchemaInfo | null> | null = null

export function getCachedSchema(): SchemaInfo | null {
  return cached
}

export async function fetchSchema(baseUrl: string): Promise<SchemaInfo | null> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch(`${baseUrl}/schema`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return null
      const info = (await res.json()) as SchemaInfo
      cached = info
      return info
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Build/replace the cache from already-fetched hits (TS fallback inference). */
export function ensureSchemaFromHits(hits: Array<{ fields?: Record<string, unknown> }>): SchemaInfo {
  if (cached) return cached
  const roles = inferRoles(hits.map(h => h.fields ?? {}))
  cached = { roles, labels: roles.labels, facets: {}, primary_tag: roles.tags[0] ?? null }
  return cached
}
