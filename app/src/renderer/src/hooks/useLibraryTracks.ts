// import { useEffect, useMemo, useState } from 'react'
// import { execute, GetTracksByStateIdsDocument } from '../../.graphclient'
// import type { Track } from '../types'

// // reuse the same normalizer from useGraph — copy/import as appropriate
// function normalizeManifestState(state: any): Track[] {
//   const { id: stateId, owner, schemaName, manifest } = state
//   if (!manifest?.files) return []
//   return manifest.files.map((file: any, i: number) => {
//     const fields: Record<string, any> = {}
//     for (const f of file.fileFields ?? []) fields[f.name ?? ''] = f
//     const name = file.name ?? `track-${i}`
//     return {
//       id: `${stateId}-${name}-${i}`,
//       manifestStateId: stateId,
//       title: fields['title']?.value ?? name,
//       artist: fields['artist']?.value ?? owner.slice(0, 8) + '…',
//       album: fields['album']?.value ?? schemaName,
//       trackNumber: fields['trackNumber']?.value ?? null,
//       duration: fields['duration']?.value ?? '—',
//       genre: fields['genre']?.value ?? '',
//       image: fields['image']?.value ?? null,
//       owner,
//       datasourceName: schemaName,
//       name,
//       price: (parseFloat(fields['price']?.value)).toString() ?? '0',
//       currency: 'USDC',
//       acc: fields['audio']?.acc ?? null,
//     } satisfies Track
//   })
// }

// export interface LibraryEntry {
//   nullifier: string
//   manifestStateId: string
// }

// export interface UseLibraryTracksResult {
//   tracks: Track[]
//   loading: boolean
//   error: string | null
// }

// /**
//  * Fetches owned tracks directly from the subgraph using the manifestStateId
//  * stored alongside each library entry. Independent of the browse pagination
//  * — the library is always complete, regardless of how much of the catalog
//  * has been loaded.
//  */
// export function useLibraryTracks(
//   entries: Record<string, LibraryEntry>
// ): UseLibraryTracksResult {
//   const [tracks, setTracks] = useState<Track[]>([])
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // Unique manifest state IDs across the library. One state can hold many
//   // tracks, but the user might own only some of them — we'll filter after.
//   const stateIds = useMemo(() => {
//     const set = new Set<string>()
//     for (const e of Object.values(entries)) {
//       if (e.manifestStateId) set.add(e.manifestStateId)
//     }
//     return Array.from(set).sort()
//   }, [entries])

//   // join into a stable string so the effect only re-runs when the set
//   // actually changes
//   const stateIdsKey = stateIds.join(',')

//   useEffect(() => {
//     if (stateIds.length === 0) {
//       setTracks([])
//       return
//     }

//     let cancelled = false
//     setLoading(true)
//     setError(null)

//     ;(async () => {
//       try {
//         const result = await execute(GetTracksByStateIdsDocument, {
//           ids: stateIds,
//         }) as any

//         if (result.errors?.length) throw new Error(result.errors[0].message)

//         const all = (result.data?.manifestStates ?? []).flatMap(normalizeManifestState)
//         const ownedIds = new Set(Object.keys(entries))
//         const owned = all.filter((t: any) => ownedIds.has(t.id))

//         if (!cancelled) setTracks(owned)
//       } catch (e) {
//         if (!cancelled) setError(e instanceof Error ? e.message : String(e))
//       } finally {
//         if (!cancelled) setLoading(false)
//       }
//     })()

//     return () => { cancelled = true }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [stateIdsKey])

//   return { tracks, loading, error }
// }