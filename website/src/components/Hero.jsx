import React from 'react'
import './Hero.css'

const DOWNLOAD_URL = '#download'
const DISCORD_URL = 'https://discord.gg/your-invite'
const CONTACT_URL = 'mailto:hello@sond3r.app'

// import heroImg from '../assets/hero.jpg'
const HERO_IMAGE = null

export default function Hero({ tab }) {
  const isArtist = tab === 'artist'

  return (
    <section className="hero">
      <div
        className="hero-bg"
        style={HERO_IMAGE ? { backgroundImage: `url(${HERO_IMAGE})` } : {}}
      >
        {!HERO_IMAGE && <div className="hero-bg-fill" />}
        {HERO_IMAGE && <div className="hero-overlay" />}
      </div>

      <div className="hero-content">
        <span className="hero-eyebrow">
          {isArtist ? 'For artists' : 'Music discovery'}
        </span>
        {isArtist ? (
          <>
            <h1 className="hero-headline">
              Your music.<br /><em>Your rules.</em>
            </h1>
            <p className="hero-sub">
              Publish on your terms, set your own prices, and keep what you earn.
              Access enforced by cryptography, not by a company that can change its mind.
            </p>
            <div className="hero-actions" id="download">
              <a href={CONTACT_URL} className="hero-btn-white">Download</a>
              <a href={DISCORD_URL} className="hero-btn-ghost" target="_blank" rel="noopener noreferrer">Join the Discord</a>
            </div>
          </>
        ) : (
          <>
            <h1 className="hero-headline">
              Music that<br /><em>actually</em><br />knows you.
            </h1>
            <p className="hero-sub">
              SOND3R learns your taste privately and locally.
              The more you listen, the better it knows you.
              Your profile stays on your machine, always yours.
            </p>
            <div className="hero-actions" id="download">
              <a href={DOWNLOAD_URL} className="hero-btn-primary">Download</a>
              <a href={DISCORD_URL} className="hero-btn-ghost" target="_blank" rel="noopener noreferrer">Join the Discord</a>
            </div>
            <p className="hero-footnote">Requires Spotify Premium</p>
          </>
        )}
      </div>
    </section>
  )
}
