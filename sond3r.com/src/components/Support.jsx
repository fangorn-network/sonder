import React from 'react'
import './Support.css'

const TIERS = [
  {
    id: 'believer',
    name: 'Believer',
    price: 'Pay what you want',
    priceRange: '$1 – $10',
    limit: null,
    desc: 'You don\'t need a reason beyond believing this matters. Your name goes into the record before anyone else\'s.',
    items: [
      'Permanent listing in the SOND3R genesis manifest',
      'Founding Discord — real updates, no marketing',
      'First to know when beta opens',
    ],
    cta: 'Join the Story',
    href: '#',
    highlight: false,
    accent: false,
  },
  {
    id: 'seedling',
    name: 'Seedling',
    price: '$25',
    limit: null,
    desc: 'Your taste profile lives on your machine, not a server. SOND3R builds it as you listen — private, portable, and entirely yours. We\'ll get you set up personally.',
    items: [
      'Packaged SOND3R app — download and go, no dev setup',
      'Personal onboarding: we get you running, async, on your schedule',
      'Kernel builds your local taste graph as you listen',
      'Playback via Spotify or YouTube Music',
      'Founding Discord with real build updates',
      'Genesis manifest listing',
      'Access through public beta launch',
    ],
    cta: 'Become a Seedling',
    href: '#',
    highlight: false,
    accent: false,
  },
  {
    id: 'sapling',
    name: 'Sapling',
    price: '$100',
    limit: null,
    desc: 'You create as well as listen. Tag your music, upload your tracks to decentralized storage, and publish under access rules you define. Direct line to the people building it.',
    items: [
      'Everything in Seedling',
      'Lifetime access — when SOND3R goes commercial, you never pay again',
      'Write access: tag tracks, set genres, moods, and metadata',
      'Upload your music to IPFS under your own Fangorn access control rules',
      'Signal thread with the founders — not a support queue, an actual conversation',
      'Real input on what ships next: your use case informs the roadmap',
    ],
    cta: 'Become a Sapling',
    href: '#',
    highlight: true,
    accent: false,
  },
  {
    id: 'ent',
    name: 'Ent',
    price: '$250',
    limit: '5 spots',
    desc: 'You\'re not buying a product. You\'re joining the founding cohort of a cryptographic protocol. Five people will have shaped what programmable access control in music actually looks like. This is one of those seats.',
    items: [
      'Everything in Sapling',
      'Use the app today — we install it with you on a live call, no waitlist',
      'Founding Partner credit, permanent and on-chain',
      'Monthly architecture sessions with Big and Coleman — you\'re in the room where protocol decisions get made',
      'First right: your custom Fangorn schema designed and deployed, free, before public access opens',
      'First right to participate in our SAFE round at founding terms, when it closes',
    ],
    cta: 'Claim a Founding Seat',
    href: '#',
    highlight: false,
    accent: true,
  },
]

export default function Support() {
  return (
    <section className="support" id="support">
      <div className="support-intro">
        <h2 className="support-heading">Be here from the start.</h2>
        <p className="support-sub">
          We are not taking VC money. We are looking for early supporters who understand what this is and want a seat at the table while it is still being built.
        </p>
      </div>

      <div className="tiers">
        {TIERS.map(tier => {
          const cls = [
            'tier',
            tier.highlight ? 'tier--highlight' : '',
            tier.accent    ? 'tier--accent'    : '',
          ].filter(Boolean).join(' ')

          const ctaCls = [
            'tier-cta',
            tier.highlight ? 'tier-cta--highlight' : '',
            tier.accent    ? 'tier-cta--accent'    : '',
          ].filter(Boolean).join(' ')

          return (
            <div key={tier.id} className={cls}>
              <div className="tier-head">
                <div>
                  <p className="tier-name">{tier.name}</p>
                  {tier.limit && <p className="tier-limit">{tier.limit}</p>}
                </div>
                <p className="tier-price">{tier.price}</p>
              </div>
              <p className="tier-desc">{tier.desc}</p>
              <ul className="tier-list">
                {tier.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a href={tier.href} className={ctaCls}>
                {tier.cta}
              </a>
            </div>
          )
        })}
      </div>

      <p className="support-note">
        Payments via Stripe. You are supporting active development and getting direct access in return.
      </p>
    </section>
  )
}