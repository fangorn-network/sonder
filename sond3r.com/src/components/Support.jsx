import React from 'react'
import './Support.css'

const TIERS = [
  {
    id: 'signal',
    name: 'Signal',
    price: 'Pay what you want',
    limit: null,
    desc: "No product pitch. If the idea is enough, this is how you say so. We keep a list of everyone who showed up before launch. You'll be on it.",
    items: [
      'Listed as a founding backer',
      'Announcements when something real ships',
    ],
    cta: 'Send a Signal',
    href: '#',
    highlight: false,
    accent: false,
  },
  {
    id: 'listener',
    name: 'Listener',
    price: '$25',
    limit: '75 spots',
    desc: "The app runs on your machine. So does your taste profile. SOND3R builds it as you listen — it doesn't leave your computer, it doesn't touch a server, and it gets more accurate over time. You get it on day one.",
    items: [
      'App access from day one — connect Spotify or YouTube Music and go',
      'Onboarding doc with real context on what you have and how to use it',
      'Founding Discord — build updates, not announcements',
      'Listed as a founding backer',
      'Rate locked — if SOND3R ever charges for access, you pay no more than this',
    ],
    cta: 'Start Listening',
    href: '#',
    highlight: false,
    accent: false,
  },
  {
    id: 'curator',
    name: 'Curator',
    price: '$100',
    limit: '25 spots',
    desc: "You get write access. Tag any track in Spotify with genres, moods, themes, custom metadata. That data feeds the kernel and shapes what SOND3R learns — yours and, eventually, the broader graph. We'll get you set up personally and you'll have a direct line to us while we build.",
    items: [
      'Everything in Listener',
      'Write access: tag Spotify tracks with genres, moods, themes, and custom metadata',
      'Personal onboarding — async, on your schedule',
      'Direct Signal thread with the founders',
      'Your use case gets real weight in what ships next',
      'First right to participate in our funding round at founding terms',
    ],
    cta: 'Become a Curator',
    href: '#',
    highlight: true,
    accent: false,
  },
  {
    id: 'ent',
    name: 'Ent',
    price: '$250',
    limit: '10 spots',
    desc: "Fangorn is the protocol underneath SOND3R. It handles who can access what data, and under what conditions — defined in code, not platform policy. Ten people will have shaped what that looks like in practice. Not at the feature level. At the architecture level.",
    items: [
      'Everything in Curator',
      'Live onboarding call — you are running before we hang up',
      'On-chain Founding Partner credit',
      'Monthly architecture sessions with Big and Coleman',
      'Your own Fangorn schema, designed and deployed before public access opens',
      'First right to participate in our funding round at founding terms',
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
            tier.accent ? 'tier--accent' : '',
          ].filter(Boolean).join(' ')

          const ctaCls = [
            'tier-cta',
            tier.highlight ? 'tier-cta--highlight' : '',
            tier.accent ? 'tier-cta--accent' : '',
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