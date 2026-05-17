import React, { useState } from 'react'
import './Product.css'
import screen1 from '../assets/Kernel.png'
import screen2 from '../assets/nowPlaying.png'
import screen3 from '../assets/agent.png'

const LISTENER_FEATURES = [
  {
    num: '01',
    label: 'Discover',
    title: 'Your taste, not their algorithm.',
    desc: 'As you listen, SOND3R builds a mathematical model of your taste. It lives on your device. No setup, no configuration. It reads what you have already built and surfaces what actually fits.',
    img: screen1,
  },
  {
    num: '02',
    label: 'The shared layer',
    title: 'A brain shared between listeners.',
    desc: 'Your local profile contributes to a shared semantic graph. Every listener adds to it. None of them own it. When you search or browse, your agent navigates that graph on your behalf across the whole network.',
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
    desc: 'Upload directly to decentralized storage. No platform approval, no content moderation queue, no account in good standing required. Your files go to IPFS. They stay there.',
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
          A music browser that grows with you. Your taste profile lives on your device and contributes to a shared semantic graph that no single party owns. Your agent navigates both.
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
          <div key={f.num} className="feature">
            <div className="feature-meta">
              <span className="feature-num">{f.num}</span>
              <span className="feature-label">{f.label}</span>
            </div>
            <div className="feature-body">
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
              {f.img && (
                <div className="feature-img">
                  <img src={f.img} alt={f.label} />
                </div>
              )}
            </div>
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