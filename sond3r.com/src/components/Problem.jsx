import React from 'react'
import './Problem.css'

export default function Problem() {
  return (
    <section className="problem">
      <div className="problem-inner">
        <h2 className="problem-heading">
          Platforms built a $300 billion industry on your listening history.
        </h2>
        <div className="problem-cols">
          <p>
            Your taste in music is a data asset. Spotify models who you are as a listener, then sells that model. The recommendation engine, the moat they defend against every competitor, was built from your behavior. You cannot export it. You cannot move it. You don't benefit from it.
          </p>
          <p>
            That arrangement was presented as convenience. It was extraction. SOND3R is a different architecture entirely: your profile builds locally, on your device, under no one's control but yours.
          </p>
        </div>
      </div>
    </section>
  )
}
