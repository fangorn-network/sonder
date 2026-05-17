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
      <div className="hero-bg">
        {HERO_IMAGE
          ? <img src={HERO_IMAGE} alt="" className="hero-img" />
          : <div className="hero-img-placeholder" />
        }
        <div className="hero-scrim" />
      </div>

      <div className="hero-content">
        <h1 className="hero-headline">
          {isArtist ? 'Your music. Your rules.' : 'Music that knows you.'}
        </h1>
        <p className="hero-sub">
          {isArtist
            ? 'Publish on your terms. Set your own prices. Keep everything you earn.'
            : 'A music browser that adapts to you. Private, local, and entirely yours.'
          }
        </p>
        <div className="hero-actions" id="download">
          {isArtist ? (
            <>
              <a href={CONTACT_URL} className="hero-btn">Get in touch</a>
              <a href={DISCORD_URL} className="hero-btn hero-btn--ghost" target="_blank" rel="noopener noreferrer">Discord</a>
            </>
          ) : (
            <>
              <a href={DOWNLOAD_URL} className="hero-btn">Download</a>
              <a href={DISCORD_URL} className="hero-btn hero-btn--ghost" target="_blank" rel="noopener noreferrer">Discord</a>
            </>
          )}
        </div>
        {!isArtist && <p className="hero-footnote">Requires Spotify Premium</p>}
      </div>
    </section>
  )
}