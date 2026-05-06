import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

/**
 * Fangorn Music — Landing Page
 *
 * Aesthetic: aligned with the app (Bebas Neue + Inter + DM Mono, purple on
 * near-black). A single hairline armature runs down the left margin of the
 * content column with tick marks at each section anchor, acting as a
 * botanical-diagram reference rail rather than a decorative illustration.
 */

// ────────────────────────────────────────────────────────────────────────
// Font loader
// ────────────────────────────────────────────────────────────────────────

function useFonts() {
  useEffect(() => {
    if (document.getElementById('fangorn-fonts')) return;
    const link = document.createElement('link');
    link.id = 'fangorn-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?' +
      'family=Bebas+Neue&' +
      'family=Inter:wght@300;400;500;600&' +
      'family=DM+Mono:wght@400;500&' +
      'display=swap';
    document.head.appendChild(link);
  }, []);
}

// ────────────────────────────────────────────────────────────────────────
// Left margin armature — single hairline with tick marks at sections
// ────────────────────────────────────────────────────────────────────────

function MarginRail() {
  // The rail sits to the left of the container, aligned with the content edge.
  // Tick positions are approximate and anchored to section spacing.
  return (
    <div className="fg-rail" aria-hidden="true">
      <div className="fg-rail-line" />
    </div>
  );
}

// Small cross-mark glyph used at section anchors
function AnchorMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main landing page
// ────────────────────────────────────────────────────────────────────────

export default function Landing() {
  useFonts();
  const { ready, authenticated, login } = usePrivy();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const heroRef = useRef<HTMLDivElement>(null);

  const handleEnterApp = () => {
    if (!ready) return;
    if (authenticated) {
      window.location.href = '/browse';
    } else {
      login();
    }
  };

  return (
    <div style={styles.page}>
      <style>{globalCss}</style>
      <MarginRail />

      {/* ═══════════════════════════════════════════ NAV */}
      <nav style={styles.nav} className="fg-nav">
        <div style={styles.navInner} className="fg-nav-inner">
          <a href="/" style={styles.logo} className="fg-logo">
            <span>fangorn<span style={{ color: 'var(--accent)' }}>.</span>music</span>
          </a>
          <div style={styles.navLinks} className="fg-nav-links">
            <a href="#how" style={styles.navLink}>How it works</a>
            <a href="#artists" style={styles.navLink}>For artists</a>
            <a href="#faq" style={styles.navLink}>FAQ</a>
            <a
              href="https://fangorn.network"
              target="_blank"
              rel="noreferrer"
              style={styles.navLink}
            >
              Protocol ↗
            </a>
          </div>
          <button onClick={handleEnterApp} style={styles.navCta} className="fg-nav-cta" disabled={!ready}>
            {authenticated ? 'Open app →' : 'Connect'}
          </button>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════ HERO */}
      <header ref={heroRef} style={styles.hero} className="fg-hero">
        <div style={styles.heroContent}>
          <h1 style={styles.h1} className="fg-h1">
            <span>Your Music.</span>
            <br />
            <span style={styles.h1Accent}>Your Rules.</span>
          </h1>

          <p style={styles.heroLede} className="fg-hero-lede">
            Fangorn Music is built for artists who are done renting their
            audience from a platform. Publish on your terms, set your own prices
            and splits, and keep what you earn. Access is enforced by
            cryptography, not by a company that can change its mind.
          </p>

          <div style={styles.heroCtas} className="fg-hero-ctas">
            <button
              onClick={handleEnterApp}
              style={{ ...styles.btn, ...styles.btnPrimary }}
            >
              <span>Start listening</span>
              <span style={styles.btnArrow}>→</span>
            </button>
            <a href="mailto:hello@fangorn.network" style={styles.heroTextLink}>
              Publishing? Get in touch →
            </a>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════ MANIFESTO */}
      <section style={styles.manifestoSection} className="fg-manifesto">
        <div style={styles.container} className="fg-container">
          <div style={styles.manifestoGrid} className="fg-manifesto-grid">
            <aside style={styles.manifestoAside} className="fg-manifesto-aside">
              <SectionAnchor label="§ 01 · the thesis" />
            </aside>
            <div style={styles.manifestoBody}>
              <p style={styles.manifestoLead} className="fg-manifesto-lead">
                The platform era is ending. What replaces it should belong to
                the people making the work, not the companies renting it back
                to them.
              </p>
              <p style={styles.manifestoProse}>
                For two decades, platforms built their moat on one mechanism:
                controlling who could access what. Your followers live on their
                servers. Your catalog runs on their licenses. Your audience is
                rented, never owned. That arrangement was never eternal. It was
                the equilibrium that held while platforms controlled the
                interface between creator and listener.
              </p>
              <p style={styles.manifestoProse}>
                Fangorn is a protocol that moves access control out of platform
                policy and into code. Fangorn Music is a reference client that
                speaks it. What a record label tried to promise through
                contracts, Fangorn delivers through cryptography: ownership
                that cannot be revoked, splits that execute on payment, and
                infrastructure that works whether or not any one company stays
                alive to run it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ FEATURES */}
      <section id="features" style={styles.section} className="fg-section">
        <div style={styles.container} className="fg-container">
          <SectionHeader label="§ 02 · what you get" title="Four things a platform cannot promise." />
          <div style={styles.featureStack} className="fg-feature-stack">
            {features.map((f, i) => (
              <article key={i} style={styles.featureBlock} className="fg-feature-block">
                <div style={styles.featureNum}>{String(i + 1).padStart(2, '0')}</div>
                <div style={styles.featureContent}>
                  <h3 style={styles.featureTitle}>{f.title}</h3>
                  <p style={styles.featureBody}>{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ HOW IT WORKS */}
      <section id="how" style={styles.section} className="fg-section">
        <div style={styles.container} className="fg-container">
          <SectionHeader label="§ 03 · how it works" title="Publish once. The protocol handles the rest." />
          <div style={styles.stepList}>
            {steps.map((s, i) => (
              <div key={i} style={styles.step} className="fg-step">
                <div style={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</div>
                <div style={styles.stepContent}>
                  <h4 style={styles.stepTitle} className="fg-step-title">{s.title}</h4>
                  <p style={styles.stepBody}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ FOR ARTISTS */}
      <section id="artists" style={styles.section} className="fg-section">
        <div style={styles.container} className="fg-container">
          <SectionHeader label="§ 04 · for artists" title="Built for the ones who are done asking permission." />
          <div style={styles.artistGrid} className="fg-artist-grid">
            <div style={styles.artistCopy}>
              <p style={styles.artistLead}>
                A record label tries to promise ownership, transparency, and a
                fair split. Those promises are only as durable as the contract
                behind them, and the company willing to honor it. Fangorn makes
                the same promises in code. That means the promises outlive the
                company that made them.
              </p>
              <ul style={styles.checklist}>
                {artistPoints.map((p, i) => (
                  <li key={i} style={styles.checkItem}>
                    <AnchorMark />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:hello@fangorn.network"
                style={{ ...styles.btn, ...styles.btnPrimary, marginTop: '2rem' }}
                className="fg-artist-cta"
              >
                <span>Get in touch</span>
                <span style={styles.btnArrow}>→</span>
              </a>
            </div>
            <aside style={styles.artistCard} className="fg-artist-card">
              <div style={styles.artistCardHeader}>
                <span style={styles.pulseDot} />
                <span style={styles.mono}>data.json</span>
              </div>
              <pre style={styles.codeBlock} className="fg-code-block">{`[
  {
    "name": "atom-heart-mother",
    "fields": {
      "title": "Atom Heart Mother",
      "artist": "Pink Floyd",
      "album": "1970-04-30: Ohm Suite Ohm - Fillmore West, San Francisco",
      "trackNumber": "1",
      "genre": "Unknown",
      "duration": "0",
      "image": "",
      "audio": {
        "@type": "handle",
        "uri": "r2://music/01.-atom-heart-mother/[1970-04-29] Ohm Suite Ohm - Fillmore West, San Francisco/01. Atom Heart Mother.mp3",
        "workerUrl": "https://fangorn-access-worker.quickbeam.workers.dev"
      }
    }
  }
]`}</pre>
              <div style={styles.artistCardFoot}>
                <span style={styles.mono}>registered on-chain · enforced by the protocol</span>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ FAQ */}
      <section id="faq" style={styles.section} className="fg-section">
        <div style={styles.container} className="fg-container">
          <SectionHeader label="§ 05 · questions" title="Plain answers to the honest questions." />
          <div style={styles.faqList}>
            {faqs.map((f, i) => (
              <div
                key={i}
                style={{
                  ...styles.faqItem,
                  ...(openFaq === i ? styles.faqOpen : {}),
                }}
                className="fg-faq-item"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={styles.faqTrigger}
                  className="fg-faq-trigger"
                >
                  <span>{f.q}</span>
                  <span style={{
                    ...styles.faqIcon,
                    transform: openFaq === i ? 'rotate(90deg)' : 'rotate(0)',
                  }}>›</span>
                </button>
                {openFaq === i && <p style={styles.faqAnswer} className="fg-faq-answer">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ FOOTER */}
      <footer style={styles.footer} className="fg-footer">
        <div style={styles.container} className="fg-container">
          <div style={styles.footerTop} className="fg-footer-top">
            <div>
              <div style={{ ...styles.logo, fontSize: '22px' }}>
                <span>fangorn<span style={{ color: 'var(--accent)' }}>.</span>music</span>
              </div>
              <p style={styles.footerTag}>
                A reference client for the Fangorn protocol. Open, permissionless,
                and built to be replaced by something better.
              </p>
            </div>
            <div style={styles.footerCols} className="fg-footer-cols">
              <FooterCol title="Contact" links={[
                ['Mail', 'mailto:hello@fangorn.network'],
                ['Discord', 'https://discord.gg/hjNARbhsrf'],
              ]} />
              <FooterCol title="Protocol" links={[
                ['fangorn.network', 'https://fangorn.network'],
                ['Blog', 'https://paragraph.com/@fangorn'],
                ['GitHub', 'https://github.com/fangorn-network'],
              ]} />
              <FooterCol title="Build on it" links={[
                ['Fangorn SDK', 'https://github.com/fangorn-network'],
                ['x402f Payment Rail', 'https://github.com/fangorn-network/x402f'],
                ['MCP server', 'https://github.com/fangorn-network/fangorn-mcp'],
                ['Subgraphs', 'https://github.com/fangorn-network/subgraphs'],
                ['Agent', 'https://github.com/fangorn-network/fangorn-agent'],
              ]} />
            </div>
          </div>
          <div style={styles.footerBottom} className="fg-footer-bottom">
            <span style={styles.mono}>
              © 2026 fangorn network · {new Date().toISOString().slice(0, 10)}
            </span>
            <span style={styles.mono}>arbitrum sepolia · music.fangorn.network</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────

function SectionAnchor({ label }: { label: string }) {
  return (
    <div style={styles.sectionAnchor}>
      <AnchorMark />
      <span style={styles.sectionLabel}>{label}</span>
    </div>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div style={styles.sectionHeader} className="fg-section-header">
      <SectionAnchor label={label} />
      <h2 style={styles.h2} className="fg-h2">{title}</h2>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h5 style={styles.footerColTitle}>{title}</h5>
      <ul style={styles.footerColList}>
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} style={styles.footerLink}>{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Content
// ────────────────────────────────────────────────────────────────────────

const features = [
  {
    title: 'Your catalog, your keys',
    body: 'You register your music to the protocol and you control how it is accessed, priced, and distributed. No platform sits above you with the power to take it down, change the terms, or lock you out.',
  },
  {
    title: 'Paid directly',
    body: 'Listeners pay your wallet in the same transaction that unlocks the track. There is no platform in the middle holding funds, setting payout schedules, or taking a cut on the way through.',
  },
  {
    title: 'Anonymous listening',
    body: 'Purchases clear through zero-knowledge proofs. You can verify the sale without ever seeing who bought the track, which keeps your audience free from profiling and surveillance.',
  },
  {
    title: 'Portable by design',
    body: 'Fangorn Music is one client. Anyone can build another. Your schema, pricing, and files travel with you to every client that speaks the Fangorn protocol.',
  },
];

const steps = [
  {
    title: 'Define your catalog on your terms',
    body: 'Set prices per track or per tier. Name your collaborators and their splits. Choose what access you grant and what you withhold. The schema is yours; you write it once and the protocol remembers it forever.',
  },
  {
    title: 'Let the code enforce it',
    body: 'When someone listens, payment clears to every address on the split in the same transaction. No label approving the release, no distributor taking a cut, no platform deciding whether your work deserves a slot today.',
  },
  {
    title: 'Stay portable, stay in control',
    body: 'Your catalog lives on chain and in storage you can move. Any client that speaks the Fangorn protocol can serve it. If Fangorn Music disappears tomorrow, your music still works, and your listeners still have what they paid for.',
  },
];

const artistPoints = [
  'You keep 100% of what listeners pay.',
  'Your pricing, your terms, your discovery. No A&R, no release calendar, no gatekeeper.',
  'You own the schema. You can move your catalog to any Fangorn client, anytime.',
  'If Fangorn the company disappears, your catalog keeps working. That is the point.',
];

const faqs = [
  {
    q: 'What is Fangorn, actually?',
    a: 'Fangorn is a protocol for programmable access control. It lets publishers define exactly who can access their data and under what conditions, enforced by code instead of platform policy. Fangorn Music is a reference client for that protocol, built for artists and listeners. The protocol itself is open and permissionless, so other clients can and will exist.',
  },
  {
    q: 'So this is not a marketplace or a streaming platform?',
    a: 'No. Marketplaces and platforms sit between creators and audiences and take a cut for the privilege. Fangorn is infrastructure, closer in spirit to Stripe or HTTPS than to Spotify or Bandcamp. Fangorn Music happens to be where you can listen today because we built the reference client. It is not the point.',
  },
  {
    q: 'Do listeners need to understand crypto to use this?',
    a: 'No. Sign in with email, Google, or an existing wallet. An embedded wallet is created for you automatically if you do not have one. Payments clear in USDC on Arbitrum. The cryptography runs in the background; listening feels like listening.',
  },
  {
    q: 'What happens if Fangorn, the company, disappears?',
    a: 'Your catalog lives on chain and in storage you can control. Your splits, your prices, and your audio stay enforceable because the enforcement lives in code, not in a service we operate. Any Fangorn client, built by anyone, can serve your music. That portability is the whole point of the architecture.',
  },
  {
    q: 'Is this open source?',
    a: 'The protocol contracts and the SONDER settlement protocol are open source. This client is a reference implementation meant to be forked, extended, and replaced by better clients over time. We are trying to build infrastructure you depend on, not a platform you are trapped inside.',
  },
  {
    q: 'How is this different from Audius, Sound.xyz, or Catalog?',
    a: 'Those are platforms with crypto bolted on. They still control the client, the discovery surface, and the rules. Fangorn is a protocol, and the protocol does not privilege any particular frontend. Fangorn Music is the first client. Anyone can build the next one, fork this one, or run their own, and the catalog works the same across all of them.',
  },
  {
    q: 'Where does the name come from?',
    a: 'Fangorn Forest. The Ents tended trees nobody was looking at, on a timescale nobody was measuring, and when the moment came they moved. Felt right for infrastructure meant to outlast the platforms it replaces.',
  },
];

// ────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────

const colors = {
  bg: '#08080a',
  bgAlt: '#0d0d10',
  bgCard: '#121215',
  bgElev: '#18181c',
  ink: '#dddbe8',
  inkMuted: '#d8d8d8',
  inkFaint: '#5b5b5c',
  inkDim: '#8a8a94',
  accent: '#a78bfa',
  accentHi: '#7c5de8',
  accentDim: 'rgba(167, 139, 250, 0.10)',
  border: '#28282f',
  border2: 'rgba(221, 219, 232, 0.12)',
};

const globalCss = `
  * { box-sizing: border-box; }
  body { margin: 0; background: ${colors.bg}; }
  ::selection { background: ${colors.accentHi}; color: ${colors.bg}; }

  :root {
    --accent: ${colors.accent};
  }

  /* ─── Left margin armature ───────────────────────────────────── */
  .fg-rail {
    position: fixed;
    top: 0;
    left: calc(50% - 550px - 32px);
    width: 1px;
    height: 100vh;
    pointer-events: none;
    z-index: 1;
  }
  .fg-rail-line {
    width: 1px;
    height: 100%;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      ${colors.border} 10%,
      ${colors.border} 90%,
      transparent 100%
    );
  }

  @media (max-width: 1180px) {
    .fg-rail { display: none; }
  }

  /* ─── Link hovers ────────────────────────────────────────────── */
  .fg-nav-link:hover { color: ${colors.accent} !important; }
  .fg-footer-link:hover { color: ${colors.accent} !important; }

  /* ─── Tablet ─────────────────────────────────────────────────── */
  @media (max-width: 960px) {
    .fg-artist-grid {
      grid-template-columns: 1fr !important;
      gap: 3rem !important;
    }
    .fg-footer-top {
      grid-template-columns: 1fr !important;
      gap: 3rem !important;
    }
    .fg-manifesto-grid {
      grid-template-columns: 1fr !important;
      gap: 1.5rem !important;
    }
  }

  /* ─── Mobile ─────────────────────────────────────────────────── */
  @media (max-width: 680px) {
    .fg-container {
      padding: 0 1.25rem !important;
    }
    .fg-nav-inner {
      padding: 0.75rem 1.25rem !important;
      gap: 0.75rem !important;
    }
    .fg-nav-links {
      display: none !important;
    }
    .fg-logo {
      font-size: 18px !important;
    }
    .fg-nav-cta {
      padding: 0.5rem 0.9rem !important;
      font-size: 11px !important;
    }
    .fg-hero {
      min-height: auto !important;
      padding: 4rem 1.25rem 5rem !important;
    }
    .fg-h1 {
      font-size: clamp(3.5rem, 14vw, 5rem) !important;
      margin-bottom: 2rem !important;
    }
    .fg-hero-lede {
      font-size: 1rem !important;
      margin-bottom: 2.5rem !important;
    }
    .fg-hero-ctas {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 1.25rem !important;
    }
    .fg-hero-ctas > button {
      justify-content: center;
      width: 100%;
      padding: 1rem 1.2rem !important;
    }
    .fg-section {
      padding: 4rem 0 !important;
    }
    .fg-manifesto {
      padding: 5rem 0 4rem !important;
    }
    .fg-section-header {
      margin-bottom: 3rem !important;
    }
    .fg-h2 {
      font-size: clamp(2.2rem, 8vw, 3rem) !important;
    }
    .fg-manifesto-grid {
      grid-template-columns: 1fr !important;
      gap: 1.5rem !important;
    }
    .fg-manifesto-lead {
      font-size: 1.3rem !important;
    }
    .fg-feature-stack {
      gap: 0 !important;
    }
    .fg-feature-block {
      grid-template-columns: 60px 1fr !important;
      gap: 1rem !important;
      padding: 2rem 0 !important;
    }
    .fg-step {
      grid-template-columns: 60px 1fr !important;
      gap: 1rem !important;
      padding: 2rem 0 !important;
    }
    .fg-step-title {
      font-size: 1.3rem !important;
    }
    .fg-artist-grid {
      grid-template-columns: 1fr !important;
      gap: 2.5rem !important;
    }
    .fg-artist-cta {
      width: 100%;
      justify-content: center;
    }
    .fg-code-block {
      font-size: 11px !important;
      padding: 1rem !important;
      line-height: 1.6 !important;
    }
    .fg-faq-trigger {
      font-size: 1rem !important;
      padding: 1.25rem 0 !important;
      gap: 1rem;
    }
    .fg-faq-answer {
      font-size: 0.95rem !important;
      margin: 0 0 1.25rem !important;
    }
    .fg-footer {
      margin-top: 4rem !important;
      padding: 3rem 0 1.5rem !important;
    }
    .fg-footer-top {
      grid-template-columns: 1fr !important;
      gap: 2.5rem !important;
      margin-bottom: 2.5rem !important;
    }
    .fg-footer-cols {
      grid-template-columns: 1fr 1fr !important;
      gap: 1.5rem !important;
    }
    .fg-footer-bottom {
      flex-direction: column !important;
      gap: 0.5rem !important;
      align-items: flex-start !important;
    }
  }

  @media (max-width: 400px) {
    .fg-footer-cols {
      grid-template-columns: 1fr !important;
    }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: colors.bg,
    color: colors.ink,
    fontFamily: '"Inter", system-ui, sans-serif',
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
  },

  // Nav
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backdropFilter: 'blur(20px)',
    background: 'rgba(8, 8, 10, 0.85)',
    borderBottom: `1px solid ${colors.border}`,
  },
  navInner: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '1rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '2rem',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: colors.ink,
    textDecoration: 'none',
    fontFamily: '"Bebas Neue", sans-serif',
    fontSize: '22px',
    letterSpacing: '0.05em',
    lineHeight: 1,
  },
  navLinks: {
    display: 'flex',
    gap: '2rem',
  },
  navLink: {
    color: colors.inkDim,
    textDecoration: 'none',
    fontFamily: '"DM Mono", monospace',
    fontSize: '12px',
    letterSpacing: '0.02em',
    transition: 'color 0.15s',
  },
  navCta: {
    background: 'transparent',
    color: colors.accent,
    border: `1px solid ${colors.accent}`,
    padding: '0.55rem 1.1rem',
    borderRadius: '2px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },

  // Hero
  hero: {
    position: 'relative',
    minHeight: '86vh',
    display: 'flex',
    alignItems: 'center',
    padding: '6rem 2rem 8rem',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    maxWidth: '1100px',
    margin: '0 auto',
    width: '100%',
  },
  h1: {
    fontFamily: '"Bebas Neue", sans-serif',
    fontSize: 'clamp(4rem, 11vw, 9rem)',
    fontWeight: 400,
    lineHeight: 0.95,
    letterSpacing: '0.01em',
    margin: 0,
    marginBottom: '2.5rem',
    textTransform: 'uppercase',
  },
  h1Accent: {
    color: colors.accent,
  },
  heroLede: {
    fontSize: 'clamp(1.05rem, 1.4vw, 1.2rem)',
    lineHeight: 1.6,
    color: colors.inkMuted,
    maxWidth: '640px',
    margin: '0 0 3.5rem',
    fontWeight: 300,
  },
  heroCtas: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '2rem',
  },
  heroTextLink: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '12px',
    letterSpacing: '0.04em',
    color: colors.inkDim,
    textDecoration: 'none',
    transition: 'color 0.15s',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.9rem 1.6rem',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    textDecoration: 'none',
    border: 'none',
  },
  btnPrimary: {
    background: colors.accent,
    color: colors.bg,
  },
  btnArrow: {
    transition: 'transform 0.15s',
  },

  // Container + sections
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '0 2rem',
    position: 'relative',
  },
  section: {
    padding: '7rem 0',
  },
  sectionHeader: {
    marginBottom: '5rem',
    maxWidth: '720px',
  },
  sectionAnchor: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.7rem',
    color: colors.accent,
    marginBottom: '1.25rem',
  },
  sectionLabel: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
  },
  h2: {
    fontFamily: '"Bebas Neue", sans-serif',
    fontSize: 'clamp(2.5rem, 5vw, 4rem)',
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: '0.01em',
    margin: 0,
    textTransform: 'uppercase',
    color: colors.ink,
  },

  // Manifesto
  manifestoSection: {
    padding: '9rem 0 8rem',
    background: colors.bgAlt,
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
  },
  manifestoGrid: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr',
    gap: '3rem',
  },
  manifestoAside: {
    paddingTop: '0.5rem',
  },
  manifestoBody: {
    maxWidth: '680px',
  },
  manifestoLead: {
    fontFamily: '"Inter", sans-serif',
    fontSize: 'clamp(1.6rem, 2.6vw, 2rem)',
    lineHeight: 1.35,
    fontWeight: 300,
    margin: '0 0 2.5rem',
    color: colors.ink,
    letterSpacing: '-0.01em',
  },
  manifestoProse: {
    fontSize: '1.05rem',
    lineHeight: 1.75,
    color: colors.inkDim,
    margin: '0 0 1.5rem',
    fontWeight: 300,
  },

  // Features — vertical editorial stack
  featureStack: {
    display: 'flex',
    flexDirection: 'column',
  },
  featureBlock: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '3rem',
    padding: '3rem 0',
    borderTop: `1px solid ${colors.border}`,
    alignItems: 'start',
  },
  featureNum: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '12px',
    color: colors.accent,
    letterSpacing: '0.1em',
    paddingTop: '0.5rem',
  },
  featureContent: {
    maxWidth: '640px',
  },
  featureTitle: {
    fontFamily: '"Bebas Neue", sans-serif',
    fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
    fontWeight: 400,
    margin: '0 0 1rem',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    lineHeight: 1,
    color: colors.ink,
  },
  featureBody: {
    fontSize: '1.02rem',
    lineHeight: 1.7,
    color: colors.inkDim,
    margin: 0,
    fontWeight: 300,
  },

  // Steps
  stepList: {
    display: 'flex',
    flexDirection: 'column',
  },
  step: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '3rem',
    padding: '3rem 0',
    borderTop: `1px solid ${colors.border}`,
    alignItems: 'start',
  },
  stepNumber: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '12px',
    color: colors.accent,
    letterSpacing: '0.1em',
    paddingTop: '0.5rem',
  },
  stepContent: {
    maxWidth: '640px',
  },
  stepTitle: {
    fontFamily: '"Bebas Neue", sans-serif',
    fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
    fontWeight: 400,
    margin: '0 0 1rem',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    lineHeight: 1,
    color: colors.ink,
  },
  stepBody: {
    fontSize: '1.02rem',
    lineHeight: 1.7,
    color: colors.inkDim,
    margin: 0,
    fontWeight: 300,
  },

  // Artists
  artistGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4rem',
    alignItems: 'start',
  },
  artistCopy: {},
  artistLead: {
    fontSize: '1.1rem',
    lineHeight: 1.75,
    color: colors.inkDim,
    margin: '0 0 2.5rem',
    fontWeight: 300,
  },
  checklist: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  checkItem: {
    display: 'flex',
    gap: '0.9rem',
    alignItems: 'flex-start',
    color: colors.ink,
    fontSize: '1rem',
    lineHeight: 1.6,
    fontWeight: 300,
    paddingTop: '3px',
  },
  artistCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  artistCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.bgAlt,
  },
  pulseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: colors.accent,
  },
  mono: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    color: colors.inkDim,
    letterSpacing: '0.02em',
  },
  codeBlock: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '12px',
    lineHeight: 1.7,
    color: colors.accent,
    padding: '1.5rem',
    margin: 0,
    overflowX: 'auto',
  },
  artistCardFoot: {
    padding: '0.75rem 1.25rem',
    borderTop: `1px solid ${colors.border}`,
    background: colors.bgAlt,
  },

  // FAQ
  faqList: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: `1px solid ${colors.border}`,
  },
  faqItem: {
    borderBottom: `1px solid ${colors.border}`,
    transition: 'background 0.15s',
  },
  faqOpen: {
    background: colors.bgAlt,
  },
  faqTrigger: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.75rem 0',
    background: 'transparent',
    border: 'none',
    color: colors.ink,
    fontFamily: '"Inter", sans-serif',
    fontSize: '1.1rem',
    fontWeight: 400,
    textAlign: 'left',
    cursor: 'pointer',
    letterSpacing: '-0.01em',
  },
  faqIcon: {
    fontFamily: '"Inter", sans-serif',
    color: colors.accent,
    fontSize: '1.5rem',
    fontWeight: 300,
    transition: 'transform 0.2s',
    marginLeft: '1rem',
    flexShrink: 0,
    display: 'inline-block',
  },
  faqAnswer: {
    fontSize: '0.98rem',
    lineHeight: 1.75,
    color: colors.inkDim,
    margin: '0 0 1.75rem',
    maxWidth: '760px',
    fontWeight: 300,
  },

  // Footer
  footer: {
    marginTop: '6rem',
    padding: '5rem 0 2rem',
    borderTop: `1px solid ${colors.border}`,
    background: colors.bgAlt,
  },
  footerTop: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '4rem',
    marginBottom: '4rem',
  },
  footerTag: {
    color: colors.inkFaint,
    fontSize: '0.9rem',
    lineHeight: 1.7,
    maxWidth: '320px',
    margin: '1rem 0 0',
    fontWeight: 300,
  },
  footerCols: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '2rem',
  },
  footerColTitle: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    margin: '0 0 1rem',
    fontWeight: 500,
  },
  footerColList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  footerLink: {
    color: colors.inkDim,
    textDecoration: 'none',
    fontSize: '0.88rem',
    transition: 'color 0.15s',
    fontWeight: 300,
  },
  footerBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '2rem',
    borderTop: `1px solid ${colors.border}`,
    color: colors.inkFaint,
    fontSize: '11px',
  },
};