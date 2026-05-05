import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface LibraryEntry {
  id: string
  nullifier: string
  manifestStateId: string
}

export function useFirebase(userId: string | null) {
  const [entries, setEntries] = useState<Record<string, LibraryEntry>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setEntries({})
      setLoading(false)
      return
    }

    const q = query(collection(db, 'users', userId, 'library'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next: Record<string, LibraryEntry> = {}
      for (const d of snapshot.docs) {
        const raw = d.data() as Partial<LibraryEntry>
        next[d.id] = {
          id: d.id,
          nullifier: raw.nullifier ?? '',
          manifestStateId: raw.manifestStateId ?? '',
        }
      }
      setEntries(next)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [userId])

  const addToLibrary = useCallback(
    async (id: string, nullifier: string, manifestStateId: string) => {
      if (!userId) return
      const ref = doc(db, 'users', userId, 'library', id)
      await setDoc(ref, { id, nullifier, manifestStateId })
    },
    [userId]
  )

  const removeFromLibrary = useCallback(
    async (id: string) => {
      if (!userId) return
      const ref = doc(db, 'users', userId, 'library', id)
      await deleteDoc(ref)
    },
    [userId]
  )

  const isInLibrary = useCallback(
    (id: string): boolean => id in entries,
    [entries]
  )

  const getNullifier = useCallback(
    (id: string): string | null => entries[id]?.nullifier ?? null,
    [entries]
  )

  const ids = useMemo(() => Object.keys(entries), [entries])

  return {
    ids,
    entries,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
    getNullifier,
    loading,
  }
}