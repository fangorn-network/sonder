import React from 'react'
import './Support.css'

const TIERS = [
  {
    id: 'seedling',
    name: 'Seedling',
    price: '$25',
    limit: null,
    desc: 'Back the build and get in line for beta. Requires a free Spotify developer account and Spotify Premium.',
    items: [
      'Read access: discover and play when beta opens',
      'Kernel builds your taste profile as you listen',
      'Founding Discord with real build updates',
      'Listed in the genesis manifest',
    ],
    cta: 'Become a Seedling',
    href: '#',
    highlight: false,
  },
  {
    id: 'sapling',
    name: 'Sapling',
    price: '$100',
    limit: null,
    desc: 'Read and write. Tag tracks, set genres, publish your data to Fangorn. Requires a free Spotify developer account and Spotify Premium.',
    items: [
      'Everything in Seedling',
      'Write access: tag tracks, define genres and moods, publish to Fangorn',
      'Direct line to the founders via Signal',
      'Real input on what ships next',
    ],
    cta: 'Become a Sapling',
    href: '#',
    highlight: true,
  },
  {
    id: 'ent',
    name: 'Ent',
    price: '$250',
    limit: '5 spots',
    desc: 'Use SOND3R now, before beta. No Spotify developer setup required. Spotify Premium is all you need.',
    items: [
      'Everything in Sapling',
      'Skip the waitlist: use the app today',
      'Monthly architecture calls with the founding team',
      'Real input into protocol design and direction',
    ],
    cta: 'Claim an Ent Spot',
    href: '#',
    highlight: false,
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
        {TIERS.map(tier => (
          <div key={tier.id} className={`tier${tier.highlight ? ' tier--highlight' : ''}`}>
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
            <a href={tier.href} className={`tier-cta${tier.highlight ? ' tier-cta--highlight' : ''}`}>
              {tier.cta}
            </a>
          </div>
        ))}
      </div>

      <p className="support-note">
        Payments via Stripe. You are supporting active development and getting direct access in return.
      </p>
    </section>
  )
}
