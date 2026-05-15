import React, { useState, useEffect } from 'react'
import './Nav.css'

const GITHUB_URL = 'https://github.com/your-org/sond3r'

export default function Nav({ tab, setTab }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <a href="/" className="nav-logo">SOND3R</a>
      <div className="nav-right">
        <a href={GITHUB_URL} className="nav-link" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="#download" className="nav-download">
          {tab === 'listener' ? 'Download' : 'Get in touch'}
        </a>
      </div>
    </nav>
  )
}
