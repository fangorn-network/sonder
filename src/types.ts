import type { CSSProperties } from 'react'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  trackNumber: string
  duration: string
  price: string
  genre: string
  owner: string
  acc: any
  currency: string
  datasourceName: string
  name: string
  image: string
  owned?: boolean   // true if the connected wallet has already paid for this track
}

// export type FangornMiddleware = Awaited<ReturnType<typeof createFangornMiddleware>>

export type PlayState = 'idle' | 'loading' | 'playing' | 'error'

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

export type ViewName = 'Browse' | 'Library' | 'Upload'

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