// utils/agentToTrack.ts
import type { Track } from '../types'

interface AgentFileField {
  name: string
  value?: string
  atType?: string
  acc?: string
}

interface AgentFile {
  id: string
  name: string
  schemaName: string
  manifestStateId: string
  fileFields: AgentFileField[]
}

function field(fields: AgentFileField[], name: string): string {
  return fields.find(f => f.name === name)?.value ?? ''
}

export function agentFileToTrack(file: AgentFile): Track {
  const fields = file.fileFields
  // owner address is the first 42 chars of manifestStateId
  const owner = file.manifestStateId.slice(0, 42)

  return {
    id: file.id,
    manifestStateId: file.manifestStateId,
    name: file.name,
    title: field(fields, 'title') || file.name.replace(/-/g, ' '),
    artist: field(fields, 'artist'),
    album: field(fields, 'album'),
    trackNumber: field(fields, 'trackNumber'),
    duration: field(fields, 'duration'),
    price: field(fields, 'price'),
    genre: field(fields, 'genre'),
    image: field(fields, 'image'),
    owner,
    acc: fields.find(f => f.name === 'audio')?.acc ?? 'plain',
    currency: field(fields, 'currency'),
    datasourceName: file.schemaName,
  }
}

export function agentResultToTracks(mcpResult: any): Track[] {
  const files = Array.isArray(mcpResult?.data) ? mcpResult.data : [];
  const tracks = files.map(agentFileToTrack);

  const latestByKey = new Map<string, Track>();
  for (const track of tracks) {
    const key = track.audio?.toString().toLowerCase()
      ?? `${track.artist}|${track.title}|${track.album}`.toLowerCase();
    if (!key || key === '||') continue;
    latestByKey.set(key, track); // overwrites — last wins
  }
  return Array.from(latestByKey.values());
}