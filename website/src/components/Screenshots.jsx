import React, { useEffect, useRef } from 'react'
import './Screenshots.css'

// Import your screenshots when ready:
// import screen1 from '../assets/screen-discover.png'
// import screen2 from '../assets/screen-artist.png'
// import screen3 from '../assets/screen-auctions.png'

const SCREENS = [
  {
    num: '01',
    label: 'Discover',
    title: 'Search by feel, not just genre.',
    description:
      'Tell SOND3R what you\'re in the mood for in plain language. Late night focus music. Something melancholic but driving. SOND3R understands what you mean.',
    img: null, // replace with screen1
  },
  {
    num: '02',
    label: 'Your Profile',
    title: 'Your taste. On your machine.',
    description:
      'Every listen shapes a profile that lives locally. No cloud. No data harvesting. Just a picture of you as a listener that gets sharper over time.',
    img: null, // replace with screen2
  },
  {
    num: '03',
    label: 'Label Auctions',
    title: 'Get paid to really listen.',
    description:
      'Artists drop tracks into auctions. You listen carefully, pick the tags you think fit best, and earn USDC when your taste matches the consensus.',
    img: null, // replace with screen3
  },
]

export default function Screenshots() {
  const rowsRef = useRef([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12 }
    )
    rowsRef.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section className="screenshots" id="features">
      <div className="screenshots-intro">
        <p className="section-label">What it does</p>
        <h2 className="screenshots-title">
          Built for listeners<br />who care.
        </h2>
      </div>

      <div className="screenshots-list">
        {SCREENS.map((s, i) => (
          <div
            key={s.num}
            className={`screen-row screen-row--${i % 2 === 0 ? 'normal' : 'flipped'}`}
            ref={el => rowsRef.current[i] = el}
          >
            <div className="screen-image-wrap">
              {s.img
                ? <img src={s.img} alt={s.label} className="screen-img" />
                : (
                  <div className="screen-placeholder">
                    <span>{s.label} screenshot</span>
                  </div>
                )
              }
            </div>
            <div className="screen-copy">
              <span className="screen-label">{s.label}</span>
              <h3 className="screen-title">{s.title}</h3>
              <p className="screen-desc">{s.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
