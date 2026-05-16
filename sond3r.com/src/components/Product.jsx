import React from 'react'
import './Product.css'

import screen1 from '../assets/Kernel.png'
import screen2 from '../assets/nowPlaying.png'
import screen3 from '../assets/agent.png'

const FEATURES = [
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
    desc: 'Your local profile syncs into a shared semantic graph. Every listener contributes to it. None of them own it. When you search or browse, your agent navigates that graph on your behalf across the whole network.',
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

export default function Product() {
  return (
    <section className="product">
      <div className="product-intro">
        <h2 className="product-title">SOND3R.</h2>
        <p className="product-sub">
          A music browser that grows with you. Your taste profile lives on your device. It also contributes to a shared semantic graph that no single party owns. Your agent navigates both.
        </p>
      </div>

      <div className="features">
        {FEATURES.map(f => (
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

      <div className="demo-wrap">
        <h2 className="demo-heading">Watch it work.</h2>
        <div className="demo-frame">
          {/* Replace inner div with: <iframe src="YOUTUBE_EMBED" frameBorder="0" allowFullScreen /> */}
          <div className="demo-placeholder">
            <div className="demo-play">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{marginLeft:'3px'}}>
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span>Demo coming soon</span>
          </div>
        </div>
      </div>
    </section>
  )
}
