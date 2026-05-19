import React from 'react'
import CityCanvas from './CityCanvas'
import './Hero.css'

import heroImg from '../assets/hero.png'
const HERO_IMAGE = heroImg

const DISCORD_URL = 'https://discord.gg/VU6vTmunCt'
const DOWNLOAD_URL = '#'
const BOOK_DEMO_URL = 'https://calendly.com/driemworks-fangorn/sond3r-fangorn-demo'

export default function Hero() {
  return (
    <section className="hero">
      <CityCanvas />

      {/* Dark gradient so city doesn't compete with text */}
      <div className="hero-veil" />

      <div className="hero-content">
        {/* <p className="hero-kicker">Local-first agentic music browser</p> */}

        <h1 className="hero-headline">
          {/* PLACEHOLDER */}
          Your rules.<br />Not theirs.
        </h1>

        <p className="hero-sub">
          SOND3R builds a picture of your taste as you listen. That picture lives on your device, grows as you use it, and belongs to no one but you.
        </p>

        <div className="hero-actions">
          <a href={DOWNLOAD_URL} className="hero-btn-ghost">Download (coming soon)</a>
          <a href={DISCORD_URL} className="hero-btn-primary" target="_blank" rel="noopener noreferrer">Discord</a>
          <a href={BOOK_DEMO_URL} className="hero-btn-primary" target="_blank" rel="noopener noreferrer">Book a Demo</a>
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
        <span>v0.0.1</span>
      </div>
    </section>
  )
}
