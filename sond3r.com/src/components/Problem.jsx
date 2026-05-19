import React from 'react'
import './Problem.css'

export default function Problem() {
  return (
    <section className="problem">
      <div className="problem-inner">
        <h2 className="problem-heading">
          Platforms built a $300 billion industry on your listening history. Your cut is zero.
        </h2>
        <div className="problem-cols">
          <p>
            Your taste in music, built up over decades, from your favorite artists to what you will skip and what you would love, does not belong to you. 
            Spotify collects your listening behavior, models who you are as a listener, and shares this with advertisers. 
            The recommendation engine they defend against every competitor is built from your behavior. 
            You cannot export it. You cannot move it. This arrangement, presented as convenience, is really extraction. 
          </p>
          <p>
            SOND3R is an open-source, local-first music that acts agentically, meaning it works for you in the background, on your machine, not on a server.
            Your profile lives on your device, under your control, and goes where you go across contexts.
            It teats your treats your taste as a first-class primitive rather than a resource to harvest, creating an organic, serendipitous, and shared human experience free from platform economics.
          </p>
        </div>
      </div>
    </section>
  )
}
