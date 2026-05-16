import React from 'react'
import './Footer.css'

const GITHUB_URL = 'https://github.com/your-org/sond3r'
const DISCORD_URL = 'https://discord.gg/your-invite'
const FANGORN_URL = 'https://fangorn.network'
const CONTACT_URL = 'mailto:hello@sond3r.app'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-cta">
        <p className="section-mono">05 — Get started</p>
        <h2 className="footer-heading">Download SOND3R.</h2>
        <div className="footer-actions">
          <a href="#" className="footer-btn-primary">Download</a>
          <a href={DISCORD_URL} className="footer-btn-ghost" target="_blank" rel="noopener noreferrer">Discord</a>
          <a href="#support" className="footer-btn-ghost">Support us</a>
        </div>
        <p className="footer-note">Requires Spotify Premium. Alpha release.</p>
      </div>

      <div className="footer-bottom">
        <span className="footer-logo">SOND3R</span>
        <div className="footer-links">
          <a href={FANGORN_URL} target="_blank" rel="noopener noreferrer">Fangorn Protocol</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a>
          <a href={CONTACT_URL}>Contact</a>
        </div>
      </div>
    </footer>
  )
}
