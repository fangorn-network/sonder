import React, { useState, useCallback } from 'react'
import './Support.css'

const QUICK_AMOUNTS = [10, 25, 50, 100, 250]
const MAX = 250
const STRIPE_BASE_URL = 'https://donate.stripe.com/fZu14meFv9vy3Rjb3ZeZ200'

export default function Support() {
  const [amount, setAmount] = useState(25)
  const [customVal, setCustomVal] = useState('')

  const update = useCallback((val, source) => {
    // Ensure the number is at least 1, default to 1 if user clears out the text input entirely
    const parsed = Number(val)
    const n = isNaN(parsed) || parsed < 1 ? 1 : Math.round(parsed)
    
    setAmount(n)
    if (source !== 'custom') setCustomVal('')
  }, [])

  const handleSlider = (e) => update(e.target.value, 'slider')
  const handleQuick = (val) => update(val, 'quick')
  const handleCustom = (e) => {
    const val = e.target.value
    setCustomVal(val)
    // Only update the actual checkout amount if they've typed a number greater than 0
    if (val && Number(val) > 0) {
      update(val, 'custom')
    }
  }

  const handleCta = () => {
    // Pass the state amount converted to cents via the official __prefilled_amount parameter
    window.open(`${STRIPE_BASE_URL}?__prefilled_amount=${amount * 100}`, '_blank')
  }

  const pct = Math.min((amount / MAX) * 100, 100)
  const sliderBg = `linear-gradient(to right, #00ffe7 ${pct}%, rgba(255,255,255,0.12) ${pct}%)`

  return (
    <section className="support" id="support">
      <div className="support-layout">
        <div className="support-left">
          <h2 className="support-heading">Get<br />early<br />access.</h2>
          <div className="support-perks">
            <span>Early access to SOND3R</span>
            <span>Direct access to the founding team</span>
            <span>Private Telegram for Early Supporters</span>
            <span>First rights to participate in future funding rounds</span>
          </div>
        </div>

        <div className="support-right">
          <div className="support-amount-wrap">
            <p className="support-amount">${amount}</p>
          </div>

          <div className="support-slider-wrap">
            <input
              type="range"
              className="support-slider"
              min={1}
              max={MAX}
              step={1}
              value={Math.min(amount, MAX)}
              onChange={handleSlider}
              style={{ background: sliderBg }}
            />
            <div className="support-slider-labels">
              <span>$1</span>
              <span>$250+</span>
            </div>
          </div>

          <div className="support-quick">
            {QUICK_AMOUNTS.map(val => (
              <button
                key={val}
                type="button"
                className={`support-quick-btn${amount === val ? ' active' : ''}`}
                onClick={() => handleQuick(val)}
              >
                ${val}
              </button>
            ))}
          </div>

          <div className="support-custom-wrap">
            <span className="support-custom-label">Other: $</span>
            <input
              type="number"
              className="support-custom-input"
              min={1}
              placeholder="Custom amount"
              value={customVal}
              onChange={handleCustom}
            />
          </div>

          <button type="button" className="support-cta" onClick={handleCta}>
            Support now - ${amount}
          </button>

          <p className="support-note">Via Stripe. Supporting active development.</p>
        </div>
      </div>
    </section>
  )
}