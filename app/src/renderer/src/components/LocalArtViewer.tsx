/**
 * components/LocalArtViewer.tsx
 *
 * Full-resolution lightbox for stored album/artist artwork. Fetches the data URL
 * via LocalMusicProvider and shows the image at its natural size (bounded to the
 * viewport). Backdrop click, ✕, or Esc closes.
 */

import { useEffect, useState } from 'react'
import { useLocalMusic, type ArtScope } from '../providers/LocalMusicProvider'

export function LocalArtViewer({
  scope, artKey, label, onClose,
}: {
  scope: ArtScope
  artKey: string
  label?: string
  onClose: () => void
}) {
  const lm = useLocalMusic()
  const [url, setUrl] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    lm.getArt(scope, artKey).then((u) => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [scope, artKey, lm.artRev, lm.getArt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32,
      }}
    >
      {url && (
        <img
          src={url}
          alt={label ?? ''}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', boxShadow: '0 10px 48px rgba(0,0,0,0.6)' }}
        />
      )}
      {url === null && (
        <div style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 12 }}>No image set.</div>
      )}
      {label && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em' }}
        >{label}</div>
      )}
      <button
        onClick={onClose}
        title="Close"
        style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
      >✕</button>
    </div>
  )
}
