import React from 'react'
import './TabSwitcher.css'

export default function TabSwitcher({ tab, setTab }) {
  return (
    <div className="tab-switcher">
      <div className="tab-track">
        <button
          className={`tab-btn${tab === 'listener' ? ' tab-btn--active' : ''}`}
          onClick={() => setTab('listener')}
        >
          For Listeners
        </button>
        <button
          className={`tab-btn${tab === 'artist' ? ' tab-btn--active' : ''}`}
          onClick={() => setTab('artist')}
        >
          For Artists
        </button>
        <div className={`tab-indicator tab-indicator--${tab}`} />
      </div>
    </div>
  )
}
