import React, { useState, useEffect } from 'react'
import './EntryOverlay.css'

export default function EntryOverlay({ onEnter }) {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [showCursor, setShowCursor] = useState(true)

  // Blinking cursor on the definition
  useEffect(() => {
    const id = setInterval(() => setShowCursor(c => !c), 530)
    return () => clearInterval(id)
  }, [])

  const handleEnter = () => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      onEnter?.()
    }, 800)
  }

  if (!visible) return null

  return (
    <div className={`entry-overlay ${exiting ? 'entry-overlay--exit' : ''}`}>
      <div className="entry-overlay__noise" />

      <div className="entry-overlay__content">
        {/* Dictionary header line */}
        <p className="entry-overlay__header">
          <span className="entry-overlay__dict-tag">dict.</span>
          <span className="entry-overlay__entry-num">entry #1</span>
        </p>

        {/* Headword */}
        <h1 className="entry-overlay__word">sonder</h1>

        {/* Part of speech */}
        <p className="entry-overlay__pos">
          <em>n.</em>
        </p>

        {/* Rule */}
        <div className="entry-overlay__rule" />

        {/* Definition */}
        <p className="entry-overlay__definition">
          the realization that each passerby has a life as vivid and complex
          as your own, inhabited by their own ambitions, friends, routines,
          worries and inherited craziness; an epic story that continues
          invisibly around you like an anthill sprawling deep underground,
          with elaborate passageways to thousands of other lives that you'll
          never know existed, in which you might appear only once, as an
          extra sipping coffee in the background, as a blur of traffic
          passing on the highway, as a light in the night.
          <span
            className="entry-overlay__cursor"
            style={{ opacity: showCursor ? 1 : 0 }}
          >
            ▮
          </span>
        </p>

        {/* Enter button */}
        <button className="entry-overlay__enter" onClick={handleEnter}>
          <span className="entry-overlay__enter-bracket">[</span>
          enter
          <span className="entry-overlay__enter-bracket">]</span>
        </button>
      </div>

      {/* Scanlines */}
      <div className="entry-overlay__scanlines" />
    </div>
  )
}