import React from 'react'
import './Product.css'

// Uncomment and import when screenshots are ready:
// import screen1 from '../assets/screen-discover.png'
// import screen2 from '../assets/screen-shared.png'
// import screen3 from '../assets/screen-agent.png'

const FEATURES = [
  {
    num: '01',
    label: 'Discover',
    title: 'Your taste, not their algorithm.',
    desc: 'As you listen, SOND3R builds a mathematical model of your taste. It lives on your device. No setup, no configuration. It reads what you have already built and surfaces what actually fits.',
    img: null, // replace with screen1
  },
  {
    num: '02',
    label: 'The shared layer',
    title: 'A brain shared between listeners.',
    desc: 'Your local profile syncs into a shared semantic graph. Every listener contributes to it. None of them own it. When you search or browse, your agent navigates that graph on your behalf, finding what matches your intent across the whole network.',
    img: null, // replace with screen2
  },
  {
    num: '03',
    label: 'Agent',
    title: 'Discovery that works for you.',
    desc: 'An ambient agent runs alongside you as you listen. It reads your profile, queries the shared graph, empowers discovery, queuing, and recommendation without phoning home. Music software built for the way agents actually work.',
    img: null, // replace with screen3
  },
]

export default function Product() {
  return (
    <section className="product">
      <div className="product-intro">
        <h2 className="product-title">What it does.</h2>
        <p className="product-sub">
          SOND3R is a music browser that grows with you. Your taste profile lives on your device. It also contributes to a shared semantic graph that no single party owns. Your agent navigates both.
        </p>
      </div>

      <div className="features">
        {FEATURES.map((f) => (
          <div key={f.num} className="feature">
            <div className="feature-header">
              <span className="feature-num">{f.num}</span>
              <span className="feature-label">{f.label}</span>
            </div>
            <div className="feature-body">
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
            {f.img && (
              <div className="feature-img">
                <img src={f.img} alt={f.label} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="demo-wrap">
        <h2 className="demo-heading">Watch it work.</h2>
        <div className="demo-frame">
          {/* Replace div below with: <iframe src="YOUR_YOUTUBE_EMBED" frameBorder="0" allowFullScreen /> */}
          <div className="demo-placeholder">
            <div className="demo-play">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" style={{marginLeft:'3px'}}>
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
