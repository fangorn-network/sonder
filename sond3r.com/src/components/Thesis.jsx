import React from 'react'
import './Thesis.css'

export default function Thesis() {
  return (
    <section className="thesis">
      <div className="thesis-inner">
        <p className="thesis-label">The thesis</p>
        <div className="thesis-body">
          <p>
            The platform era is ending. What replaces it should belong to the people making the work and the people listening to it — not the companies renting it back to both of them.
          </p>
          <p>
            For two decades, platforms built their moat on one mechanism: controlling who could access what. Your listening history lives on their servers. Your catalog runs on their licenses. Your audience is rented, never owned. That arrangement was never eternal.
          </p>
          <p>
            SOND3R moves access control out of platform policy and into code. What a record label tried to promise through contracts, we deliver through cryptography: ownership that cannot be revoked, payments that execute directly, infrastructure that works whether or not any one company stays alive to run it.
          </p>
        </div>
      </div>
    </section>
  )
}
