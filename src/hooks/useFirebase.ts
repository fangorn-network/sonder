import { useState, useEffect, useCallback } from 'react'
// import { db } from '@/lib/firebase' // adjust to your config path
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
}

// Pass the user identifier (wallet address, uid, etc.) as an argument
export function useFirebase(userId: string | null) {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setEntries([])
      setLoading(false)
      return
    }

    const q = query(collection(db, 'users', userId, 'library'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => d.data() as LibraryEntry)
      setEntries(docs)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [userId])

  const addToLibrary = useCallback(
    async (id: string, nullifier: string) => {
      if (!userId) return
      const ref = doc(db, 'users', userId, 'library', id)
      await setDoc(ref, { id, nullifier })
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
    (id: string): boolean => entries.some((e) => e.id === id),
    [entries]
  )

  const getNullifier = useCallback(
    (id: string): string | null =>
      entries.find((e) => e.id === id)?.nullifier ?? null,
    [entries]
  )

  const ids = entries.map((e) => e.id)

  return { ids, entries, addToLibrary, removeFromLibrary, isInLibrary, getNullifier, loading }
}