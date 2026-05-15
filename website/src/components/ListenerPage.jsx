import React from 'react'
import './ListenerPage.css'

const DISCORD_URL = 'https://discord.gg/your-invite'

// import screen1 from '../assets/screen-discover.png'
// import screen2 from '../assets/screen-artist.png'
// import screen3 from '../assets/screen-auctions.png'

const SCREENS = [
  {
    label: 'Discover',
    title: 'Search by feel, not just genre.',
    desc: 'Ask for something melancholic and driving at two in the morning. SOND3R understands what you mean.',
    img: null,
  },
  {
    label: 'Your Profile',
    title: 'Your taste. On your machine.',
    desc: 'A profile built entirely from your listening habits. Stored locally. Never shared.',
    img: null,
  },
  {
    label: 'Label Auctions',
    title: 'Get paid to really listen.',
    desc: 'Listen carefully, pick the right tags, earn USDC. Your ears are worth something here.',
    img: null,
  },
]

export default function ListenerPage() {
  return (
    <div className="listener-page">

      {/* STATEMENTS */}
      <section className="l-statements">
        <div className="l-statements-inner">
          <div className="l-statement">
            <p className="l-statement-text">
              Sond3r grows with you. Every listen shapes a taste profile that you own - not owned by a platform.
            </p>
          </div>
          <div className="l-statement">
            <p className="l-statement-text">
              Search by <i>context</i>. Tell SOND3R what you're in the mood for. Late night. Melancholic. Driving. It understands intent.
            </p>
          </div>
          <div className="l-statement">
            <p className="l-statement-text">
              Your listening insights are yours to explore any time instead of generated and wrapped once a year.
            </p>
          </div>
          {/* <div className="l-statement">
            <p className="l-statement-text">
              [FUTURE] Buy music directly from artists. Payment clears instantly to their wallet. You stay anonymous. No platform in the middle.
            </p>
          </div> */}
          <div className="l-statement l-statement--earn">
            <p className="l-statement-text">
              Earn from label auctions. Artists drop tracks asking for real feedback. Pick the tags that best describe what you hear. When your taste matches, you earn USDC.
            </p>
          </div>
        </div>
      </section>

      {/* SCREENSHOTS */}
      <section className="l-screens">
        <div className="l-screens-inner">
          {SCREENS.map((s, i) => (
            <div key={s.label} className={`l-screen-row${i % 2 !== 0 ? ' l-screen-row--flip' : ''}`}>
              <div className="l-screen-img-wrap">
                {s.img
                  ? <img src={s.img} alt={s.label} />
                  : <div className="l-screen-placeholder"><span>{s.label}</span></div>
                }
              </div>
              <div className="l-screen-copy">
                <p className="l-screen-label">{s.label}</p>
                <h3 className="l-screen-title">{s.title}</h3>
                <p className="l-screen-desc">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DEMO */}
      <section className="l-demo">
        <div className="l-demo-inner">
          <p className="l-section-eyebrow">Demo</p>
          <h2 className="l-demo-heading">Watch it work.</h2>
          <div className="l-demo-video">
            <div className="l-demo-placeholder">
              <div className="l-demo-play">
                <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <p>Demo coming soon</p>
            </div>
          </div>
        </div>
      </section>

      {/* GETTING STARTED */}
      <section className="l-start">
        <div className="l-start-inner">
          <p className="l-section-eyebrow">Getting started</p>
          <h2 className="l-start-heading">Setup guide.</h2>
          <div className="l-start-card">
            <div className="l-start-tag">Coming soon</div>
            <p className="l-start-body">
              We're making setup easier. For now you'll need to configure a Spotify app and credentials.
              Join the Discord and we'll walk you through it.
            </p>
            <a href={DISCORD_URL} className="l-btn-primary" target="_blank" rel="noopener noreferrer">
              Join the Discord
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
