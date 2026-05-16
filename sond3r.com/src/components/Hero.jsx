import React from 'react'
import CityCanvas from './CityCanvas'
import './Hero.css'

import heroImg from '../assets/hero.png'
const HERO_IMAGE = heroImg

const DISCORD_URL = 'https://discord.gg/your-invite'
const DOWNLOAD_URL = '#'

export default function Hero() {
  return (
    <section className="hero">
      <CityCanvas />

      {/* Dark gradient so city doesn't compete with text */}
      <div className="hero-veil" />

      <div className="hero-content">
        <p className="hero-kicker">Local-first agentic music browser</p>

        <h1 className="hero-headline">
          {/* PLACEHOLDER */}
          Your rules.<br />Not theirs.
        </h1>

        <p className="hero-sub">
          SOND3R builds a picture of your taste as you listen. That picture lives on your device, grows as you use it, and belongs to no one but you.
        </p>

        <div className="hero-actions">
          <a href={DOWNLOAD_URL} className="hero-btn-primary">Download</a>
          <a href={DISCORD_URL} className="hero-btn-ghost" target="_blank" rel="noopener noreferrer">Discord</a>
        </div>

        <p className="hero-fine">Requires Spotify Premium</p>
      </div>

      <div className="hero-screen">
        {HERO_IMAGE
          ? <img src={HERO_IMAGE} alt="SOND3R" className="hero-img" />
          : <div className="hero-screen-placeholder"><span>Screenshot</span></div>
        }
      </div>

      <div className="hero-footer">
        <span>Built on Fangorn Protocol</span>
        <span className="hero-footer-sep">|</span>
        <span>Arbitrum</span>
        <span className="hero-footer-sep">|</span>
        <span>v0.1 — testnet</span>
      </div>
    </section>
  )
}
