import React from 'react'
import './Hero.css'

// import heroImg from '../assets/hero.jpg'
const HERO_IMAGE = null

const DISCORD_URL = 'https://discord.gg/your-invite'
const DOWNLOAD_URL = '#'

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <p className="hero-kicker">Local-first agentic music browser</p>
        <h1 className="hero-headline">
          Your music.<br />Not theirs.
        </h1>
        <p className="hero-sub">
          SOND3R builds a picture of your taste as you listen. That picture lives on your device, grows as you use it, and belongs to no one but you.
        </p>
        <div className="hero-actions">
          <a href={DOWNLOAD_URL} className="btn-primary">Download</a>
          <a href={DISCORD_URL} className="btn-ghost" target="_blank" rel="noopener noreferrer">Discord</a>
        </div>
        <p className="hero-fine">Requires Spotify Premium</p>
      </div>

      <div className="hero-screen">
        {HERO_IMAGE
          ? <img src={HERO_IMAGE} alt="SOND3R" className="hero-img" />
          : <div className="hero-screen-placeholder"><span>Screenshot</span></div>
        }
      </div>
    </section>
  )
}
