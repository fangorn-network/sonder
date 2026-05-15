import React from 'react'
import './Footer.css'

const DISCORD_URL = 'https://discord.gg/your-invite'
const GITHUB_URL = 'https://github.com/your-org/sond3r'
const CONTACT_URL = 'mailto:hello@sond3r.app'

export default function Footer({ tab }) {
  const isArtist = tab === 'artist'

  return (
    <footer className="footer">
      <div className="footer-cta">
        <h2 className="footer-headline">
          {isArtist
            ? <>Done asking<br /><em>permission?</em></>
            : <>Ready to hear<br /><em>differently?</em></>
          }
        </h2>
        <div className="footer-actions">
          {isArtist
            ? <>
                <a href={CONTACT_URL} className="footer-btn-white">Get in touch</a>
                <a href={DISCORD_URL} className="footer-btn-ghost" target="_blank" rel="noopener noreferrer">Join the Discord</a>
              </>
            : <>
                <a href="#download" className="footer-btn-purple">Download for macOS</a>
                <a href={DISCORD_URL} className="footer-btn-ghost" target="_blank" rel="noopener noreferrer">Join the Discord</a>
              </>
          }
        </div>
      </div>

      <div className="footer-bottom">
        <span className="footer-logo">SOND3R</span>
        <div className="footer-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a>
          <a href={CONTACT_URL}>Contact</a>
        </div>
        <span className="footer-note">
          {isArtist
            ? 'Built on Arbitrum. Powered by Fangorn protocol.'
            : 'Requires Spotify Premium. Early access. Built on Arbitrum.'
          }
        </span>
      </div>
    </footer>
  )
}
