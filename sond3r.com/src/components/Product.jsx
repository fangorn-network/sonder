import React, { useState } from 'react'
import './Product.css'
import screen1 from '../assets/Kernelsmall.png'
import screen2 from '../assets/nowPlaying.png'
import screen3 from '../assets/agent.png'

const LISTENER_FEATURES = [
  {
    num: '01',
    label: 'Discover',
    title: 'Your taste, not their algorithm.',
    desc: 'Sond3r builds a local model of your listening as you go. The more you use it, the better it understands your taste and what you actually want.',
    img: screen1,
  },
  {
    num: '02',
    label: 'The shared layer',
    title: 'A Semantic Substrate Shared Between Listeners',
    desc: 'Users contribute to a shared semantic graph; building a collective picture of how music relates, built from real listening behavior across the whole network. Every listener can add to it, but nobody owns it. When you search or browse, you navigate a space built by everyone, but captured by nobody',
    img: screen2,
  },
  {
    num: '03',
    label: 'Agent',
    title: 'Discovery that works for you.',
    desc: 'An ambient agent runs alongside you as you listen. It reads your profile, queries the shared graph, and handles discovery, queuing, and recommendation without phoning home.',
    img: screen3,
  },
]

const ARTIST_FEATURES = [
  {
    num: '01',
    label: 'Upload',
    title: 'Your music, on your terms.',
    desc: 'Upload directly to any storage backend. No platform approval, content moderation queue, or account in good standing required. You own the data.',
    img: null,
  },
  {
    num: '02',
    label: 'Access control',
    title: 'Programmable as you need it.',
    desc: 'Define exactly who can access your music and under what conditions, using Fangorn. Free to stream, pay to download, token-gated, invite-only, time-limited. The rules are yours to write.',
    img: null,
  },
  {
    num: '03',
    label: 'Get paid',
    title: 'Instant settlement, no middlemen.',
    desc: 'Payments settle in USDC the moment they happen. No monthly payout cycle, no minimum threshold, no label or distributor taking a cut before you see a number. The split you define is the split you get.',
    img: null,
  },
]

export default function Product() {
  const [tab, setTab] = useState('listener')
  const features = tab === 'listener' ? LISTENER_FEATURES : ARTIST_FEATURES

  return (
    <section className="product">
      <div className="product-intro">
        <h2 className="product-title">SOND3R.</h2>
        <p className="product-sub">
          A music browser that grows with you. Your taste profile lives on your device and contributes to a shared semantic graph that no single party owns.
        </p>
      </div>

      <div className="product-tabs">
        <button
          className={`product-tab${tab === 'listener' ? ' product-tab--active' : ''}`}
          onClick={() => setTab('listener')}
        >
          For listeners
        </button>
        <button
          className={`product-tab${tab === 'artist' ? ' product-tab--active' : ''}`}
          onClick={() => setTab('artist')}
        >
          For artists
        </button>
      </div>

      <div className="features">
        {features.map(f => (
          <div key={f.num} className={`feature ${f.img ? 'feature--has-img' : 'feature--text-only'}`}>

            {/* Text Container */}
            <div className="feature-info">
              <div className="feature-meta">
                <span className="feature-num">{f.num}</span>
                <span className="feature-label">{f.label}</span>
              </div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>

            {/* Image Container */}
            {f.img ? (
              <div className="feature-img">
                <img src={f.img} alt={f.label} />
              </div>
            ) : (
              /* Empty placeholder div maintains grid alignment for text-only rows */
              <div className="feature-img-spacer" />
            )}
          </div>
        ))}
      </div>

      {tab === 'artist' && (
        <div className="artist-cta">
          <p className="artist-cta-note">
            Artist uploads are available now for early supporters. Become a Sapling to request access, or read the protocol docs at fangorn.network.
          </p>
          <div className="artist-cta-actions">
            <a href="#support" className="artist-btn-primary">Get early access</a>
            <a href="https://fangorn.network" className="artist-btn-ghost" target="_blank" rel="noopener noreferrer">Fangorn docs</a>
          </div>
        </div>
      )}

      <div className="demo-wrap">
        <h2 className="demo-heading">Watch it work.</h2>
        <div className="demo-frame">
          <div className="demo-placeholder">
            <div className="demo-play">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ marginLeft: '3px' }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span>Demo coming soon</span>
          </div>
        </div>
      </div>
    </section>
  )
}