import type { CSSProperties } from 'react'
import type { RecordVM } from './domain/recordVM'

export interface JoinedRecord {
  // Fangorn envelope
  id: string
  trackId: string
  owner: string
  manifestCid: string
  // Joined fields — shape driven by schemas
  fields: Record<string, FieldValue>
  // Kernel
  embedding?: number[]
  score?: number
  distance?: number
}

export interface FieldValueObject {
  [key: string]: FieldValue
}

export type FieldValue =
  | string | number | boolean | null
  | FieldValue[]
  | FieldValueObject

/**
 * Compatibility bridge: project a generic RecordVM into the legacy music `Track`
 * shape so not-yet-migrated music components keep working unchanged. Roles map
 * 1:1 to the old fields, so for the music dataset this reproduces the previous
 * `Track` exactly. Removed once every view consumes RecordVM directly.
 */
export function asTrack(vm: RecordVM): Track {
  const year = vm.temporal && /\d{4}/.test(vm.temporal)
    ? parseInt(vm.temporal.slice(0, 4)) || null
    : null
  const durKey = Object.keys(vm.measures).find(k => /dur|length/i.test(k))
  const durationMs = durKey ? vm.measures[durKey] : (Object.values(vm.measures)[0] ?? null)
  const contributors = Array.isArray(vm.raw.contributors)
    ? (vm.raw.contributors as any[]).map(c => ({ role: c.role ?? null, name: c.name ?? null, id: c.id ?? null }))
    : []
  return {
    id: vm.id,
    trackId: vm.identity,
    owner: vm.owner,
    manifestCid: vm.manifestCid,
    title: vm.title || 'Unknown',
    artist: vm.subtitle,
    year,
    durationMs,
    youtubeVideoId: vm.media ?? undefined,
    contributors,
    embedding: vm.embedding,
    genres: vm.tagsByField['genres'] ?? [],
    moods: vm.tagsByField['moods'] ?? [],
    themes: vm.tagsByField['themes'] ?? [],
    contexts: vm.tagsByField['contexts'] ?? [],
  }
}

export interface Track {
  id: string
  trackId: string
  owner: string
  manifestCid: string
  title: string
  artist: string
  year: number | null
  durationMs: number | null
  contributors?: { role: string | null; name: string | null; id: string | null }[]
  embedding?: number[]
  genres?: string[]
  moods?: string[]
  themes?: string[]
  contexts?: string[]
  youtubeVideoId?: string
  thumbnailUrl?: string
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'error'
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
export type ViewName = 'Discover' | 'Library' | 'Agent' | 'Analyze' | 'Profile'
export type UploadPanel = 'upload' | 'manage'

export interface ManifestEntry {
  name: string
  cid: string
  index: number
  extension: string
  fileType: string
  gadgetDescriptor: unknown
}

export interface AlbumView {
  name: string
  manifestCid: string
  entries: ManifestEntry[]
}

export interface HueStyle extends CSSProperties {
  '--hue': number
}

export interface RecommendedTracks {
  tracks: Track[]
  sourceId: string
  sourceTitle: string
}

export interface TasteProfile {
  genres: Record<string, number>
  moods: Record<string, number>
  contexts: Record<string, number>
  energyRange: [number, number] | null
  topArtists: string[]
  topTracks: { title: string; artist: string; genres: string[] }[]
  seededFromSpotify: boolean
  lastUpdated: number
  entropy: number
}

export type SignalType = 'play' | 'skip' | 'like' | 'filter' | 'similar'

export interface TasteSignal {
  type: SignalType
  track: Track
  weight: number  // play=1, skip=-1, filter=0.5, like=1.5, similar=0.75
}