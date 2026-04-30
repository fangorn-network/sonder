import type { CSSProperties } from 'react'

export interface Track {
  id: string
  manifestStateId: string
  mbid: string | null
  title: string
  artist: string
  year: number | null
  energy: number | null
  genres: string[]
  moods: string[]
  themes: string[]
  contexts: string[]
  owner: string
  datasourceName: string
  name: string
}

// export type FangornMiddleware = Awaited<ReturnType<typeof createFangornMiddleware>>

export type PlayState = 'idle' | 'loading' | 'playing' | 'error'

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

export type ViewName = 'Discover' | 'Library' | 'Upload'

export type UploadPanel = 'upload' | 'manage'

// A track entry as stored in the vault manifest
export interface ManifestEntry {
  name: string
  cid: string
  index: number
  extension: string
  fileType: string
  gadgetDescriptor: unknown
}

// A resolved album with its manifest entries
export interface AlbumView {
  name: string         // datasourceName
  manifestCid: string
  entries: ManifestEntry[]
}

// CSS custom property helper for hue-based track art colours
export interface HueStyle extends CSSProperties {
  '--hue': number
}

export interface RecommendedTracks {
  tracks: Track[]
  sourceId: string
  sourceTitle: string
}