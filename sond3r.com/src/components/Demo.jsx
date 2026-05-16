import React from 'react'
import './Demo.css'

// Set this to your YouTube embed URL when ready
// e.g. 'https://www.youtube.com/embed/YOUR_VIDEO_ID'
const VIDEO_EMBED_URL = null

export default function Demo() {
  return (
    <section className="demo" id="demo">
      <div className="demo-inner">
        <p className="section-label">See it in action</p>
        <h2 className="demo-title">Watch the demo.</h2>
        <div className="demo-video">
          {VIDEO_EMBED_URL ? (
            <iframe
              src={VIDEO_EMBED_URL}
              title="SOND3R demo"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="demo-placeholder">
              <div className="demo-play">
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p>Demo video coming soon</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
