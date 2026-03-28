// import { useState, useEffect, useCallback, useRef } from 'react'
// import { useFangorn } from './useFangorn'
// import { computeSchemaId } from '@fangorn-network/sdk'
// import { identity } from '@fangorn-network/sdk/lib/modules/gadgets/acc/gadgets.js'

// // ─── Types ────────────────────────────────────────────────────────────────────

// export interface LibraryEntry {
//   owner: string
//   schemaId: string
//   tag: string
//   paidAt: number      // unix ms timestamp
//   price: string       // USDC paid
//   // Denormalized for display — avoids re-fetching manifests
//   title: string
//   artist: string
//   genre: string
//   duration: string
//   art: string | null
// }

// interface LibraryIndex {
//   version: 1
//   entries: LibraryEntry[]
// }

// // ─── Helpers ─────────────────────────────────────────────────────────────────

// function localKey(address: string) {
//   return `fangorn.library.${address.toLowerCase()}`
// }

// function emptIndex(): LibraryIndex {
//   return { version: 1, entries: [] }
// }

// // ─── Hook ─────────────────────────────────────────────────────────────────────

// export interface UseLibraryResult {
//   library: LibraryEntry[]
//   loading: boolean
//   error: string | null
//   // Call this after a successful payment to add to library
//   addToLibrary: (entry: Omit<LibraryEntry, 'paidAt'>) => Promise<void>
//   // True if the given (owner, schemaId, tag) triple is in the library
//   isOwned: (owner: string, schemaId: string, tag: string) => boolean
//   reload: () => Promise<void>
// }

// export function useLibrary(): UseLibraryResult {
//   const { fangorn, ownerAddress } = useFangorn()
//   const [library, setLibrary]     = useState<LibraryEntry[]>([])
//   const [loading, setLoading]     = useState(false)
//   const [error, setError]         = useState<string | null>(null)

//   // Keep a ref to the raw storage + encryption service so we can write
//   // without depending on the full fangorn instance having re-initialised.
//   const indexRef = useRef<LibraryIndex>(emptIndex())

//   // ── Load ──────────────────────────────────────────────────────────────────

//   const load = useCallback(async () => {
//     if (!fangorn || !ownerAddress) return

//     setLoading(true)
//     setError(null)

//     try {
//       // Decrypt using Lit via the internal encryptionService
//       const result = await fangorn.decryptFile(ownerAddress as `0x${string}`, computeSchemaId("test.fangorn.music.library.v1"), "library.json");
//       const json = JSON.parse(atob(new TextDecoder().decode(result)))
//       setLibrary(json.entries)
//     } catch (e: any) {
//       // If decryption fails (e.g. stale CID, Lit session expired),
//       // clear the pointer and start fresh rather than hard-erroring.
//       console.warn('Library load failed, resetting:', e)
//       localStorage.removeItem(localKey(ownerAddress))
//       indexRef.current = emptIndex()
//       setLibrary([])
//       setError('Library could not be loaded — it has been reset.')
//     } finally {
//       setLoading(false)
//     }
//   }, [fangorn, ownerAddress])

//   useEffect(() => {
//     load()
//   }, [load])

//   // ── Persist ───────────────────────────────────────────────────────────────

//   const persist = useCallback(async (index: LibraryIndex) => {
//     if (!fangorn || !ownerAddress) return

//     const bytes     = new TextEncoder().encode(JSON.stringify(index))
//     const base64    = btoa(String.fromCharCode(...bytes))

//     // Build a minimal Filedata for the encryption service
//     const filedata = {
//       tag:       `library.json`,
//       data:      base64,
//       extension: '.json',
//       fileType:  'application/json',
//     }

//     const cid = await fangorn.upload(
//         [filedata], 
//         () => identity(
//             "arbitrumSepolia",
//             ownerAddress,
//         ),
//         computeSchemaId("test.fangorn.music.library.v1")
//     );

//     localStorage.setItem(localKey(ownerAddress), cid)
//   }, [fangorn, ownerAddress])

//   // ── Add to library ────────────────────────────────────────────────────────

//   const addToLibrary = useCallback(async (entry: Omit<LibraryEntry, 'paidAt'>) => {
//     const existing = indexRef.current.entries
//     // Dedupe — a track can only appear once per (owner, schemaId, tag)
//     const deduped = existing.filter(
//       e => !(e.owner === entry.owner && e.tag === entry.tag && e.schemaId === entry.schemaId)
//     )
//     const newEntry: LibraryEntry = { ...entry, paidAt: Date.now() }
//     const updated: LibraryIndex  = { version: 1, entries: [...deduped, newEntry] }

//     indexRef.current = updated
//     setLibrary(updated.entries)

//     await persist(updated)
//   }, [persist])

//   // ── isOwned ───────────────────────────────────────────────────────────────

//   const isOwned = useCallback((owner: string, schemaId: string, tag: string) => {
//     return indexRef.current.entries.some(
//       e => e.owner === owner && e.schemaId === schemaId && e.tag === tag
//     )
//   }, [library])

//   return { library, loading, error, addToLibrary, isOwned, reload: load }
// }