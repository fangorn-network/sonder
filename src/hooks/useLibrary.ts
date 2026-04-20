import { useState, useEffect, useCallback } from 'react'

const LIBRARY_KEY = 'fangorn.library'
const LIBRARY_EVENT = 'fangorn.library.updated'

export interface LibraryEntry {
  id: string
  nullifier: string
}

function readEntries(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeEntries(entries: LibraryEntry[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries))
  window.dispatchEvent(new Event(LIBRARY_EVENT))
}

export function useLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>(readEntries)

  useEffect(() => {
    function onUpdate() {
      setEntries(readEntries())
    }
    window.addEventListener(LIBRARY_EVENT, onUpdate)
    window.addEventListener('storage', onUpdate)
    return () => {
      window.removeEventListener(LIBRARY_EVENT, onUpdate)
      window.removeEventListener('storage', onUpdate)
    }
  }, [])

  const addToLibrary = useCallback((id: string, nullifier: string) => {
    const current = readEntries()
    if (!current.find(e => e.id === id)) {
      writeEntries([...current, { id, nullifier }])
    }
  }, [])

  const removeFromLibrary = useCallback((id: string) => {
    writeEntries(readEntries().filter(e => e.id !== id))
  }, [])

  const isInLibrary = useCallback((id: string): boolean => {
    return entries.some(e => e.id === id)
  }, [entries])

  const getNullifier = useCallback((id: string): string | null => {
    return entries.find(e => e.id === id)?.nullifier ?? null
  }, [entries])

  // plain IDs for compatibility with existing consumers
  const ids = entries.map(e => e.id)

  return { ids, entries, addToLibrary, removeFromLibrary, isInLibrary, getNullifier }
}