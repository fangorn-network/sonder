import type { ViewName } from '../types'

const VIEWS: ViewName[] = ['Discover', 'Library', 'Upload']

interface NavProps {
  view: ViewName
  setView: (v: ViewName) => void
}

export function Nav({ view, setView }: NavProps) {
  return (
    <nav className="nav">
      {VIEWS.map(v => (
        <button
          key={v}
          className={`nav-btn ${view === v ? 'active' : ''}`}
          onClick={() => setView(v)}
        >
          {v}
        </button>
      ))}
    </nav>
  )
}