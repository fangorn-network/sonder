import React from 'react'
import './ArtistPage.css'

const CONTACT_URL = 'mailto:hello@sond3r.app'
const DISCORD_URL = 'https://discord.gg/your-invite'

const PROMISES = [
  {
    title: 'Your catalog, your keys.',
    body: 'You register your music to the protocol and control how it is accessed, priced, and distributed. No platform with the power to take it down, change the terms, or lock you out.',
  },
  {
    title: 'Paid directly.',
    body: 'Listeners pay your wallet in the same transaction that unlocks the track. No platform holding funds, setting payout schedules, or taking a cut on the way through.',
  },
  {
    title: 'Anonymous listening.',
    body: 'Purchases clear through zero-knowledge proofs. You verify the sale without ever knowing who bought the track. Your audience stays free from profiling.',
  },
  {
    title: 'Portable by design.',
    body: 'Your schema, pricing, and files travel with you. If SOND3R disappears tomorrow, your music still works and your listeners still have what they paid for.',
  },
]

const HOW = [
  {
    title: 'Define your catalog on your terms.',
    body: 'Set prices per track or per tier. Name your collaborators and their splits. Choose what access you grant and what you withhold.',
  },
  {
    title: 'Let the code enforce it.',
    body: 'When someone listens, payment clears to every address on the split in the same transaction. No label approving the release, no distributor taking a cut.',
  },
  {
    title: 'Stay portable, stay in control.',
    body: 'Your catalog lives on-chain and in storage you can move. Any client that speaks the Fangorn protocol can serve it.',
  },
]

export default function ArtistPage() {
  return (
    <div className="artist-page">

      {/* PROMISES */}
      <section className="a-promises">
        <div className="a-promises-inner">
          <p className="a-eyebrow">What you get</p>
          <h2 className="a-section-heading">Four things a platform<br />cannot promise.</h2>
          <div className="a-promises-list">
            {PROMISES.map((p) => (
              <div key={p.title} className="a-promise">
                <h3 className="a-promise-title">{p.title}</h3>
                <p className="a-promise-body">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AUCTIONS */}
      <section className="a-auctions">
        <div className="a-auctions-inner">
          <div className="a-auctions-left">
            <p className="a-eyebrow">Label auctions</p>
            <h2 className="a-section-heading">Real ears.<br />Real feedback.</h2>
            <p className="a-auctions-body">
              Drop a track into an auction and pay for genuine listener attention. Not streams. Not passive background plays. People who actually listen and tell you what they heard.
            </p>
            <p className="a-auctions-body">
              Listeners pick from a tag vocabulary you define. Genre, mood, context, tempo. Winners are those whose tags match the crowd consensus — wisdom of the crowd, not a single A&R opinion.
            </p>
            <p className="a-auctions-body">
              You set the prize pool. It pays out instantly in USDC to winning listeners. Better signal than a playlist placement. Better discovery than a cold press release.
            </p>
          </div>
          <div className="a-auctions-right">
            <div className="a-auctions-pull">
              <blockquote>
                "The result is an honest, crowd-sourced picture of how your music actually lands."
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="a-how">
        <div className="a-how-inner">
          <p className="a-eyebrow">How it works</p>
          <h2 className="a-section-heading">Publish once.<br />The protocol handles the rest.</h2>
          <div className="a-how-list">
            {HOW.map((step, i) => (
              <div key={step.title} className="a-how-item">
                <span className="a-how-num">0{i + 1}</span>
                <div>
                  <h3 className="a-how-title">{step.title}</h3>
                  <p className="a-how-body">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IN PLAIN TERMS */}
      <section className="a-plain">
        <div className="a-plain-inner">
          <p className="a-eyebrow">In plain terms</p>
          <ul className="a-plain-list">
            <li>You keep 100% of what listeners pay.</li>
            <li>Your pricing, your terms, your discovery. No A&amp;R, no release calendar, no gatekeeper.</li>
            <li>You own the schema. Move your catalog to any Fangorn client, anytime.</li>
            <li>If SOND3R disappears, your catalog keeps working. That is the point.</li>
          </ul>
        </div>
      </section>

      {/* GETTING STARTED */}
      <section className="a-start">
        <div className="a-start-inner">
          <p className="a-eyebrow">Getting started</p>
          <h2 className="a-section-heading">Setup guide.</h2>
          <div className="a-start-card">
            <div className="a-start-tag">Coming soon</div>
            <p className="a-start-body">
              We're streamlining upload and storage configuration. Right now it takes some technical setup.
              Get in touch and we'll walk you through publishing your first track.
            </p>
            <div className="a-start-actions">
              <a href={CONTACT_URL} className="a-btn-white">Get in touch</a>
              <a href={DISCORD_URL} className="a-btn-ghost" target="_blank" rel="noopener noreferrer">Join the Discord</a>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
