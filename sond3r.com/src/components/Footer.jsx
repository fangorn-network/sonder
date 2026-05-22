import React from 'react'
import './Footer.css'

const GITHUB_URL = 'https://github.com/fangorn-network/sonder'
const DISCORD_URL = 'https://discord.gg/VU6vTmunCt'
const FANGORN_URL = 'https://fangorn.network'
const CONTACT_URL = 'mailto:fangorn@fangorn.network'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-cta">
        <p className="section-mono">Get started!</p>
        <h2>Download SOND3R [coming soon].</h2>
        <div className="footer-actions">
          <a href="#" className="footer-btn-primary">Download</a>
          <a href={DISCORD_URL} className="footer-btn-ghost" target="_blank" rel="noopener noreferrer">Discord</a>
          <a href="#support" className="footer-btn-ghost">Support us</a>
        </div>
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
