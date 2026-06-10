/**
 * recordVM.ts — the generic, schema-agnostic view-model.
 *
 * Every Chroma hit (browse / search / vector / text) carries a `fields` payload.
 * `toRecordVM` projects those raw fields through the inferred RoleMap into a
 * stable shape that all views render from, regardless of domain. This replaces
 * the hardcoded music `Track` as the primary currency of the UI; `asTrack`
 * (in types.ts) remains as a thin compatibility bridge for not-yet-migrated
 * music components.
 */

import type { RoleMap } from './roles'

export type FieldValue =
  | string | number | boolean | null
  | FieldValue[]
  | { [key: string]: FieldValue }

export interface RecordVM {
  id:          string
  identity:    string
  owner:       string
  manifestCid: string

  title:       string
  subtitle:    string
  tags:        string[]                       // flattened, ordered by tag-field richness
  tagsByField: Record<string, string[]>
  temporal:    string | null
  spatial:     { x: number; y: number } | null
  measures:    Record<string, number>
  media:       string | null                  // playable/openable source id, or null
  relations:   Record<string, string>
  text:        string[]

  embedding?:  number[]
  score?:      number
  distance?:   number
  raw:         Record<string, FieldValue>
}

interface RawHit {
  id?: string
  trackId?: string
  owner?: string
  manifestCid?: string
  fields?: Record<string, FieldValue>
  embedding?: number[]
  score?: number
  distance?: number
}

const GEO_KEYS: Record<string, string[]> = {
  lon: ['lon', 'lng', 'longitude', 'x'],
  lat: ['lat', 'latitude', 'y'],
}

function asStringList(v: FieldValue | undefined): string[] {
  if (Array.isArray(v)) return v.filter(x => x != null && x !== '').map(x => String(x))
  if (v != null && v !== '') return [String(v)]
  return []
}

function spatialXY(v: FieldValue | undefined): { x: number; y: number } | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const low: Record<string, number> = {}
  for (const [k, val] of Object.entries(v)) if (typeof val === 'number') low[k.toLowerCase()] = val
  const pick = (keys: string[]) => { for (const k of keys) if (k in low) return low[k]; return undefined }
  let lon = pick(GEO_KEYS.lon)
  let lat = pick(GEO_KEYS.lat)
  if (lon === undefined || lat === undefined) {
    const mnlon = low['min_lon'], mxlon = low['max_lon'], mnlat = low['min_lat'], mxlat = low['max_lat']
    if ([mnlon, mxlon, mnlat, mxlat].every(n => typeof n === 'number')) {
      lon = (mnlon + mxlon) / 2; lat = (mnlat + mxlat) / 2
    }
  }
  return lon !== undefined && lat !== undefined ? { x: lon, y: lat } : null
}

// When the inferred role map is unavailable (e.g. the schema hasn't loaded yet),
// fall back to the obvious field names so records never render as a raw id hash.
const FALLBACK_NAMES: Record<string, string[]> = {
  title:    ['title', 'name', 'label', 'headline'],
  subtitle: ['byArtist', 'artist', 'author', 'creator', 'user', 'user_id', 'owner', 'channel'],
}
const FALLBACK_TAG_NAMES = ['genres', 'moods', 'themes', 'contexts', 'tags', 'categories', 'keywords']

export function toRecordVM(hit: RawHit, rm: RoleMap | null): RecordVM {
  const fields = hit.fields ?? {}
  // Resolve a singular role: prefer the inferred field, then known synonyms.
  const get = (role: keyof RoleMap): string | null => {
    const f = rm ? (rm[role] as string | null) : null
    if (f && fields[f] != null && fields[f] !== '') return String(fields[f])
    for (const name of FALLBACK_NAMES[role] ?? []) {
      if (fields[name] != null && fields[name] !== '') return String(fields[name])
    }
    return null
  }

  // Tag fields: inferred list, or any array-of-string field with a known name.
  let tagFields = rm?.tags ?? []
  if (!tagFields.length) {
    tagFields = FALLBACK_TAG_NAMES.filter(n => Array.isArray(fields[n]))
  }
  const tagsByField: Record<string, string[]> = {}
  const tags: string[] = []
  for (const f of tagFields) {
    const vals = asStringList(fields[f])
    tagsByField[f] = vals
    tags.push(...vals)
  }

  const measures: Record<string, number> = {}
  for (const f of rm?.measures ?? []) {
    const v = fields[f]
    if (typeof v === 'number') measures[f] = v
    else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) measures[f] = Number(v)
  }

  const relations: Record<string, string> = {}
  for (const f of rm?.relations ?? []) {
    const v = fields[f]
    if (v != null && v !== '') relations[f] = String(v)
  }

  const identity = hit.trackId
    ?? (rm?.identity ? (fields[rm.identity] != null ? String(fields[rm.identity]) : undefined) : undefined)
    ?? (hit.id ?? '').replace(/^track:/, '')

  return {
    id:          hit.id ?? `record:${identity}`,
    identity,
    owner:       hit.owner ?? '',
    manifestCid: hit.manifestCid ?? '',
    title:       get('title') ?? identity,
    subtitle:    get('subtitle') ?? '',
    tags,
    tagsByField,
    temporal:    get('temporal'),
    spatial:     rm?.spatial ? spatialXY(fields[rm.spatial]) : null,
    measures,
    media:       get('media'),
    relations,
    text:        (rm?.text ?? []).flatMap(f => asStringList(fields[f])),
    embedding:   hit.embedding,
    score:       hit.score,
    distance:    hit.distance,
    raw:         fields,
  }
}
