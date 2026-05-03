// utils/agentToTrack.ts
import type { Track } from '../types'

// ── New shape (manifest state from subgraph) ──────────────────────────────────

interface FileField {
  name: string
  value?: string
  atType?: string
  acc?: string
}

interface ManifestFile {
  id: string
  name: string
  fileFields: FileField[]
}

interface ManifestState {
  id: string          // full manifestStateId
  owner: string
  schemaId: string
  schemaName: string
  manifestCid: string
  manifest: {
    files: ManifestFile[]
  }
  version: string
  lastUpdated: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function field(fields: FileField[], name: string): string {
  return fields?.find(f => f.name === name)?.value ?? ''
}

function fieldAll(fields: FileField[], name: string): string[] {
  return fields?.filter(f => f.name === name).map(f => f.value ?? '') ?? []
}

// ── Converters ────────────────────────────────────────────────────────────────

function manifestFileToTrack(
  file: ManifestFile,
  state: ManifestState
): Track {
  const fields = file.fileFields

  console.log('the file fields are: ' + JSON.stringify(fields))

  return {
    id:              file.id,
    manifestStateId: state.id,
    mbid:            field(fields, 'mbid'),
    name:            file.name,
    title:           field(fields, 'title') || file.name.replace(/-/g, ' '),
    artist:          field(fields, 'artist'),
    year:            parseFloat(field(fields, 'year'))  || 0,
    energy:          parseFloat(field(fields, 'energy')) ?? 100,
    genres:          fieldAll(fields, 'genres'),
    moods:           fieldAll(fields, 'moods'),
    themes:          fieldAll(fields, 'themes'),
    contexts:        fieldAll(fields, 'contexts'),
    owner:           state.owner,
    datasourceName:  state.schemaName,
  }
}

export function manifestStateToTracks(state: ManifestState): Track[] {
  return (state.manifest?.files ?? []).map(file => manifestFileToTrack(file, state))
}

export function agentResultToTracks(mcpResult: any): Track[] {
  // mcpResult.data may be a single state or an array of states
  const states: ManifestState[] = Array.isArray(mcpResult?.data)
    ? mcpResult.data
    : mcpResult?.data
      ? [mcpResult.data]
      : []

  const tracks = states.flatMap(manifestStateToTracks)

  // Deduplicate: mbid wins, then artist|title
  const latestByKey = new Map<string, Track>()
  for (const track of tracks) {
    const key = track.mbid?.toLowerCase()
      || `${track.artist}|${track.title}`.toLowerCase()
    if (!key || key === '|') continue
    latestByKey.set(key, track)
  }

  return Array.from(latestByKey.values())
}