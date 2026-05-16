import React from 'react'
import './Support.css'

const TIERS = [
  {
    id: 'seedling',
    name: 'Seedlinig',
    price: '$25',
    limit: null,
    desc: 'Get in early. Support what we are building.',
    items: [
      'Alpha access to SOND3R',
      'Private Discord community',
      'Weekly development updates',
      'Founding supporter status',
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
    desc: 'For people who want to be close to what gets built.',
    items: [
      'Everything in Seedling',
      'Reserved username',
      'Experimental features before anyone else',
      'Direct line to the founders',
      'Input into what ships next',
    ],
    cta: 'Plant your Roots',
    href: '#',
    highlight: true,
  },
  {
    id: 'ent',
    name: 'Ent',
    price: '$250',
    limit: '25 spots only',
    desc: 'For builders, researchers, and serious early believers.',
    items: [
      'Everything in Sapling',
      'Monthly calls with the founding team',
      'Architecture and protocol discussions',
      'Named in the genesis documentation',
      'Input into protocol direction',
    ],
    cta: 'Become an Ent',
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
          We are not taking VC money. We are looking for early supporters who understand what this is and want a seat at the table while it's still being built.
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
