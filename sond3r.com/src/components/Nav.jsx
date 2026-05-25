import React, { useState, useEffect } from 'react'
import './Nav.css'

const GITHUB_URL = 'https://github.com/fangorn-network/sonder'
const DISCORD_URL = 'https://discord.gg/VU6vTmunCt'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <a href="/" className="nav-logo">SOND3R</a>
      <div className="nav-links">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a>
        <a href="#support" className="nav-cta">Support us</a>
      </div>
    </nav>
  )
}
