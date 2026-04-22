import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

/**
 * Fangorn Music — Landing Page
 *
 * Aesthetic direction: organic/geometric. The page treats the browser as
 * forest canopy — a generative root system grows across the hero, section
 * dividers are botanical glyphs drawn as SVG, and the type system pairs a
 * humanist serif (Fraunces) with a terminal mono (JetBrains Mono) to keep
 * the cryptographic side visible.
 *
 * Drop into a Vite + React app. Fonts pulled from Google Fonts at runtime
 * to avoid build config; replace with @fontsource imports for production.
 */

// ────────────────────────────────────────────────────────────────────────
// Font loader (side effect, runs once)
// ────────────────────────────────────────────────────────────────────────

function useFonts() {
  useEffect(() => {
    if (document.getElementById('fangorn-fonts')) return;
    const link = document.createElement('link');
    link.id = 'fangorn-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?' +
      'family=Fraunces:opsz,wght,SOFT,WONK@9..144,300;9..144,400;9..144,500;9..144,700&' +
      'family=JetBrains+Mono:wght@400;500&' +
      'display=swap';
    document.head.appendChild(link);
  }, []);
}

// ────────────────────────────────────────────────────────────────────────
// Generative root system — SVG canvas behind the hero
// ────────────────────────────────────────────────────────────────────────

type Branch = { x1: number; y1: number; x2: number; y2: number; w: number; o: number };

function generateRoots(seed: number, width: number, height: number): Branch[] {
  // Mulberry32 PRNG for deterministic output per seed
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const branches: Branch[] = [];
  const grow = (
    x: number,
    y: number,
    angle: number,
    length: number,
    depth: number,
    width: number,
  ) => {
    if (depth === 0 || length < 4) return;
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    branches.push({ x1: x, y1: y, x2, y2, w: width, o: Math.min(0.9, 0.25 + depth * 0.08) });
    const split = 1 + (rand() > 0.6 ? 1 : 0);
    for (let i = 0; i < split + 1; i++) {
      const nextAngle = angle + (rand() - 0.5) * 0.9;
      const nextLen = length * (0.68 + rand() * 0.18);
      const nextW = Math.max(0.5, width * 0.72);
      grow(x2, y2, nextAngle, nextLen, depth - 1, nextW);
    }
  };

  // Multiple root origins along the bottom
  const origins = 4;
  for (let i = 0; i < origins; i++) {
    const x = (width / (origins + 1)) * (i + 1) + (rand() - 0.5) * 40;
    const y = height;
    const angle = -Math.PI / 2 + (rand() - 0.5) * 0.4;
    grow(x, y, angle, 80 + rand() * 40, 8, 2.2);
  }
  return branches;
}

function RootCanvas() {
  const [branches] = useState(() => generateRoots(7, 1600, 900));
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="rootFade" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor="#3a5a40" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0a0f0a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#rootFade)" />
      {branches.map((b, i) => (
        <line
          key={i}
          x1={b.x1}
          y1={b.y1}
          x2={b.x2}
          y2={b.y2}
          stroke="#a3c9a8"
          strokeWidth={b.w}
          strokeLinecap="round"
          opacity={b.o}
          style={{
            animation: `rootGrow 2.4s ease-out ${i * 0.008}s both`,
          }}
        />
      ))}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Leaf glyph — section divider
// ────────────────────────────────────────────────────────────────────────

function LeafGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 4 Q 32 14, 28 26 Q 24 34, 20 36 Q 16 34, 12 26 Q 8 14, 20 4 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path d="M20 6 L 20 34" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
      <path d="M20 14 L 15 18 M20 18 L 14 22 M20 22 L 15 26 M20 26 L 17 29"
        stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <path d="M20 14 L 25 18 M20 18 L 26 22 M20 22 L 25 26 M20 26 L 23 29"
        stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Section divider — geometric botanical rule
// ────────────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1.5rem',
      margin: '6rem auto 4rem',
      maxWidth: '600px',
      color: '#7a9e7e',
    }}>
      <div style={{ flex: 1, height: '1px', background: 'currentColor', opacity: 0.3 }} />
      <LeafGlyph size={28} />
      <div style={{ flex: 1, height: '1px', background: 'currentColor', opacity: 0.3 }} />
    </div>
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

      {/* ═══════════════════════════════════════════ NAV */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <a href="/" style={styles.logo}>
            <LeafGlyph size={22} />
            <span>fangorn<span style={{ opacity: 0.5 }}>.music</span></span>
          </a>
          <div style={styles.navLinks}>
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
          <button onClick={handleEnterApp} style={styles.navCta} disabled={!ready}>
            {authenticated ? 'Open app →' : 'Connect'}
          </button>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════ HERO */}
      <header ref={heroRef} style={styles.hero}>
        <RootCanvas />
        <div style={styles.heroContent}>
          {/* <div style={styles.eyebrow}>
            <span style={styles.eyebrowDot} />
            <span>live on arbitrum · sonder payments · zk settlement</span>
          </div> */}

          <h1 style={styles.h1}>
            Music that answers
            <br />
            <em style={styles.h1Em}>only to its makers.</em>
          </h1>

          <p style={styles.heroLede}>
            Fangorn Music is a marketplace where publishers define who can listen,
            for how much, and on what terms — enforced by cryptography, not by
            platform policy. No label intermediaries. No algorithmic gatekeepers.
            Just roots.
          </p>

          <div style={styles.heroCtas}>
            <button
              onClick={() => (window.location.href = '/browse')}
              style={{ ...styles.btn, ...styles.btnPrimary }}
            >
              <span>Listen now</span>
              <span style={styles.btnArrow}>→</span>
            </button>
            <button
              onClick={handleEnterApp}
              style={{ ...styles.btn, ...styles.btnSecondary }}
              disabled={!ready}
            >
              {authenticated ? 'Open app' : 'Connect wallet'}
            </button>
            <a href="#artists" style={{ ...styles.btn, ...styles.btnGhost }}>
              Publish your music
            </a>
          </div>

          <div style={styles.heroMeta}>
            <MetaStat label="Tracks published" value="—" />
            <MetaStat label="Artists onboarded" value="—" />
            <MetaStat label="Settlement latency" value="~2s" />
            <MetaStat label="Platform cut" value="0%" />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════ MANIFESTO */}
      <section style={styles.manifestoSection}>
        <div style={styles.container}>
          <div style={styles.manifestoGrid}>
            <aside style={styles.manifestoAside}>
              <span style={styles.sectionLabel}>§ 01 · thesis</span>
            </aside>
            <div style={styles.manifestoBody}>
              <p style={styles.manifestoLead}>
                For a century, recorded music has been <em>about</em> the artist
                but <em>belonged</em> to the distributor. Fangorn inverts that.
              </p>
              <p style={styles.manifestoProse}>
                Access control lives in the contract, not in the client. Payment
                clears in two seconds through <code style={styles.code}>SONDER</code>,
                our ERC-3009 + Semaphore settlement protocol. Proof of listening
                is a zero-knowledge nullifier — the artist knows the track was
                played, and that's the only thing they know.
              </p>
              <p style={styles.manifestoProse}>
                This is not a streaming service with a blockchain bolted on.
                It's a reference implementation of a different power structure.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* ═══════════════════════════════════════════ FEATURES */}
      <section id="features" style={styles.section}>
        <div style={styles.container}>
          <SectionHeader label="§ 02 · architecture" title="Four primitives. One protocol." />
          <div style={styles.featureGrid}>
            {features.map((f, i) => (
              <article key={i} style={styles.featureCard}>
                <div style={styles.featureHex}>
                  <FeatureIcon type={f.icon} />
                </div>
                <h3 style={styles.featureTitle}>{f.title}</h3>
                <p style={styles.featureBody}>{f.body}</p>
                <code style={styles.featureTag}>{f.tag}</code>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ═══════════════════════════════════════════ HOW IT WORKS */}
      <section id="how" style={styles.section}>
        <div style={styles.container}>
          <SectionHeader label="§ 03 · flow" title="From wallet to waveform in three steps." />
          <div style={styles.stepList}>
            {steps.map((s, i) => (
              <div key={i} style={styles.step}>
                <div style={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</div>
                <div style={styles.stepContent}>
                  <h4 style={styles.stepTitle}>{s.title}</h4>
                  <p style={styles.stepBody}>{s.body}</p>
                </div>
                <div style={styles.stepGlyph}>
                  <StepGlyph index={i} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ═══════════════════════════════════════════ FOR ARTISTS */}
      <section id="artists" style={styles.section}>
        <div style={styles.container}>
          <SectionHeader label="§ 04 · publishing" title="Your catalog. Your rules." />
          <div style={styles.artistGrid}>
            <div style={styles.artistCopy}>
              <p style={styles.artistLead}>
                Fangorn treats your catalog as a first-class cryptographic
                object. You define the schema — pricing tiers, geo-rules,
                subscription windows, collaborator splits — and the protocol
                enforces it across every listener, every stream, every payment.
              </p>
              <ul style={styles.checklist}>
                {artistPoints.map((p, i) => (
                  <li key={i} style={styles.checkItem}>
                    <CheckGlyph />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => (window.location.href = '/publish')}
                style={{ ...styles.btn, ...styles.btnPrimary, marginTop: '2rem' }}
              >
                <span>Start publishing</span>
                <span style={styles.btnArrow}>→</span>
              </button>
            </div>
            <aside style={styles.artistCard}>
              <div style={styles.artistCardHeader}>
                <span style={styles.pulseDot} />
                <span style={styles.mono}>schema.publish()</span>
              </div>
              <pre style={styles.codeBlock}>{`{
  "track": "midnight_roots.flac",
  "price": {
    "tier_1": { usdc: 0.50, plays: 1 },
    "tier_2": { usdc: 3.00, plays: "∞" }
  },
  "splits": [
    { to: "0xArt...ist", bps: 8500 },
    { to: "0xPro...ducer", bps: 1500 }
  ],
  "geo_allow": "*",
  "settlement": "SONDER_v1"
}`}</pre>
              <div style={styles.artistCardFoot}>
                <span style={styles.mono}>→ zk-verified · on-chain enforced</span>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Divider />

      {/* ═══════════════════════════════════════════ FAQ */}
      <section id="faq" style={styles.section}>
        <div style={styles.container}>
          <SectionHeader label="§ 05 · questions" title="Answers, in plain forest-tongue." />
          <div style={styles.faqList}>
            {faqs.map((f, i) => (
              <div
                key={i}
                style={{
                  ...styles.faqItem,
                  ...(openFaq === i ? styles.faqOpen : {}),
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={styles.faqTrigger}
                >
                  <span>{f.q}</span>
                  <span style={{
                    ...styles.faqIcon,
                    transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0)',
                  }}>+</span>
                </button>
                {openFaq === i && <p style={styles.faqAnswer}>{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ FOOTER */}
      <footer style={styles.footer}>
        <div style={styles.container}>
          <div style={styles.footerTop}>
            <div>
              <div style={{ ...styles.logo, fontSize: '20px' }}>
                <LeafGlyph size={20} />
                <span>fangorn<span style={{ opacity: 0.5 }}>.music</span></span>
              </div>
              <p style={styles.footerTag}>
                A reference implementation of the Fangorn protocol. Built in
                Texas. Settled on Arbitrum.
              </p>
            </div>
            <div style={styles.footerCols}>
              <FooterCol title="Product" links={[
                ['Browse', '/browse'],
                ['Library', '/library'],
                ['Publish', '/publish'],
              ]} />
              <FooterCol title="Protocol" links={[
                ['Fangorn Network', 'https://fangorn.network'],
                ['Litepaper', '/litepaper.pdf'],
                ['GitHub', 'https://github.com/fangorn-network'],
              ]} />
              <FooterCol title="Ecosystem" links={[
                ['Arbitrum', 'https://arbitrum.io'],
                ['SONDER', '/sonder'],
                ['MCP server', '/mcp'],
              ]} />
            </div>
          </div>
          <div style={styles.footerBottom}>
            <span style={styles.mono}>
              © 2026 fangorn network · {new Date().toISOString().slice(0, 10)}
            </span>
            <span style={styles.mono}>music.fangorn.network</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metaStat}>
      <div style={styles.metaValue}>{value}</div>
      <div style={styles.metaLabel}>{label}</div>
    </div>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div style={styles.sectionHeader}>
      <span style={styles.sectionLabel}>{label}</span>
      <h2 style={styles.h2}>{title}</h2>
    </div>
  );
}

function FeatureIcon({ type }: { type: string }) {
  const common = { stroke: 'currentColor', strokeWidth: 1.2, fill: 'none' };
  switch (type) {
    case 'schema':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="3" {...common} />
          <circle cx="14" cy="4" r="2" {...common} />
          <circle cx="4" cy="22" r="2" {...common} />
          <circle cx="24" cy="22" r="2" {...common} />
          <path d="M14 7 L 14 11 M11.5 16 L 5.5 20 M16.5 16 L 22.5 20" {...common} />
        </svg>
      );
    case 'settlement':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28">
          <rect x="4" y="4" width="20" height="20" rx="2" {...common} />
          <path d="M4 11 L 24 11 M11 4 L 11 24" {...common} />
          <circle cx="17" cy="17" r="2" {...common} />
        </svg>
      );
    case 'zk':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 3 L 25 9 L 25 19 L 14 25 L 3 19 L 3 9 Z" {...common} />
          <path d="M14 3 L 14 25 M3 9 L 25 19 M25 9 L 3 19" {...common} opacity="0.4" />
        </svg>
      );
    case 'storage':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28">
          <ellipse cx="14" cy="7" rx="10" ry="3" {...common} />
          <path d="M4 7 L 4 14 Q 4 17, 14 17 Q 24 17, 24 14 L 24 7" {...common} />
          <path d="M4 14 L 4 21 Q 4 24, 14 24 Q 24 24, 24 21 L 24 14" {...common} />
        </svg>
      );
    default:
      return null;
  }
}

function StepGlyph({ index }: { index: number }) {
  const shapes = [
    <circle cx="30" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="1" />,
    <polygon points="30,10 50,40 10,40" fill="none" stroke="currentColor" strokeWidth="1" />,
    <rect x="12" y="12" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(45 30 30)" />,
  ];
  return (
    <svg width="60" height="60" viewBox="0 0 60 60">
      {shapes[index % 3]}
      <circle cx="30" cy="30" r="4" fill="currentColor" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0, marginTop: '4px' }}>
      <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path d="M5 9 L 8 12 L 13 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
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
    icon: 'schema',
    title: 'Schema registry',
    body: 'Publishers declare the shape of their data — pricing, splits, access conditions — once. The registry enforces it everywhere, forever.',
    tag: 'SchemaRegistry.sol',
  },
  {
    icon: 'settlement',
    title: 'SONDER settlement',
    body: 'ERC-3009 authorization plus Semaphore nullifiers. Payments clear in one transaction, replay-free, with the listener\'s identity never touched.',
    tag: 'sonder/v1',
  },
  {
    icon: 'zk',
    title: 'Zero-knowledge proofs',
    body: 'Groth16 circuits prove "I paid for this track" without revealing who paid or what else they listen to. Privacy is the default, not a setting.',
    tag: 'semaphore@v4',
  },
  {
    icon: 'storage',
    title: 'Presigned object storage',
    body: 'Audio sits in Cloudflare R2. A Worker mints short-lived URLs only after on-chain payment verification. No keys. No decryption clients.',
    tag: 'r2 + workers',
  },
];

const steps = [
  {
    title: 'Connect any wallet — or make one in a tap',
    body: 'Privy handles wallet onboarding. Email, Google, or existing wallet. An embedded wallet is provisioned if you don\'t have one.',
  },
  {
    title: 'Pay the artist directly, at the track level',
    body: 'SONDER bundles payment and listening authorization into a single signed message. The artist is paid before the first byte of audio streams.',
  },
  {
    title: 'Listen, with the proof in your pocket',
    body: 'Your nullifier is stored client-side. Replay the track, share the rights, expire the license — all governed by the contract, not a server you rent.',
  },
];

const artistPoints = [
  'Define pricing per-track, per-tier, per-territory — whatever your deal demands.',
  'Collaborator splits execute atomically on payment. No invoicing, no escrow.',
  'You own the schema. You can export your catalog to any frontend that speaks Fangorn.',
  'No platform cut. The protocol charges gas; that\'s the entire fee structure.',
];

const faqs = [
  {
    q: 'Do listeners need crypto to use this?',
    a: 'No. Privy provisions an embedded wallet on email sign-in, and SONDER supports USDC on Arbitrum — so listeners fund once and the wallet handles signing invisibly. We\'re exploring fiat on-ramps for the next release.',
  },
  {
    q: 'Is this open source?',
    a: 'The protocol contracts (Schema, Datasource, Settlement registries) and SONDER are open source. This marketplace is a reference implementation meant to be forked; the goal is many Fangorn-speaking frontends, not one platform.',
  },
  {
    q: 'What happens if Fangorn the company disappears?',
    a: 'Your catalog lives on-chain and in object storage you control. The schema is portable. Any frontend that reads the registry can serve your music. That\'s the whole point — we\'re infrastructure, not a platform you depend on.',
  },
  {
    q: 'Why Arbitrum?',
    a: 'Sub-second finality, low enough fees for per-track micropayments, and real USDC liquidity. We\'re chain-agnostic at the protocol level; Arbitrum is where the reference implementation runs today.',
  },
  {
    q: 'How is this different from Audius, Sound.xyz, or Catalog?',
    a: 'Those are platforms with crypto features. Fangorn is a protocol with a platform on top. The access-control logic lives in contracts you can point any client at — which means competition, forks, and artist-owned frontends are first-class outcomes, not anomalies.',
  },
  {
    q: 'Where does the name come from?',
    a: 'Fangorn Forest. The Ents tended trees nobody was looking at, on a timescale nobody was measuring. Felt right.',
  },
];

// ────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────

const colors = {
  bg: '#0a0f0a',
  bgAlt: '#0f1612',
  bgCard: '#141b16',
  ink: '#e8efe5',
  inkMuted: '#a3b5a5',
  inkFaint: '#6b7d6e',
  moss: '#a3c9a8',
  mossDeep: '#3a5a40',
  accent: '#c7e8b3',
  border: 'rgba(163, 201, 168, 0.15)',
  borderStrong: 'rgba(163, 201, 168, 0.3)',
};

const globalCss = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  @keyframes rootGrow {
    from { stroke-dasharray: 1000; stroke-dashoffset: 1000; opacity: 0; }
    to { stroke-dasharray: 1000; stroke-dashoffset: 0; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  ::selection { background: ${colors.mossDeep}; color: ${colors.accent}; }
  .fg-hover:hover { color: ${colors.moss} !important; }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: colors.bg,
    color: colors.ink,
    fontFamily: '"Fraunces", Georgia, serif',
    minHeight: '100vh',
    overflow: 'hidden',
  },

  // Nav
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backdropFilter: 'blur(12px)',
    background: 'rgba(10, 15, 10, 0.75)',
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
    fontFamily: '"Fraunces", serif',
    fontSize: '22px',
    fontWeight: 500,
    letterSpacing: '-0.02em',
  },
  navLinks: {
    display: 'flex',
    gap: '2rem',
  },
  navLink: {
    color: colors.inkMuted,
    textDecoration: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.02em',
    transition: 'color 0.2s',
  },
  navCta: {
    background: colors.moss,
    color: colors.bg,
    border: 'none',
    padding: '0.6rem 1.2rem',
    borderRadius: '2px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: '0.02em',
  },

  // Hero
  hero: {
    position: 'relative',
    minHeight: '92vh',
    display: 'flex',
    alignItems: 'center',
    padding: '4rem 2rem 6rem',
    overflow: 'hidden',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    maxWidth: '1100px',
    margin: '0 auto',
    width: '100%',
  },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.4rem 0.9rem',
    border: `1px solid ${colors.border}`,
    borderRadius: '999px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    color: colors.inkMuted,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: '2.5rem',
    animation: 'fadeUp 0.8s ease-out 0.2s both',
  },
  eyebrowDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: colors.moss,
    animation: 'pulse 2s ease-in-out infinite',
  },
  h1: {
    fontFamily: '"Fraunces", serif',
    fontSize: 'clamp(2.8rem, 7vw, 5.5rem)',
    fontWeight: 300,
    lineHeight: 1.02,
    letterSpacing: '-0.03em',
    margin: 0,
    marginBottom: '2rem',
    animation: 'fadeUp 0.9s ease-out 0.3s both',
  },
  h1Em: {
    fontStyle: 'italic',
    fontWeight: 400,
    color: colors.moss,
    fontVariationSettings: '"SOFT" 100, "WONK" 1',
  },
  heroLede: {
    fontSize: 'clamp(1.1rem, 1.6vw, 1.35rem)',
    lineHeight: 1.55,
    color: colors.inkMuted,
    maxWidth: '640px',
    margin: '0 0 3rem',
    fontWeight: 400,
    animation: 'fadeUp 1s ease-out 0.45s both',
  },
  heroCtas: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '5rem',
    animation: 'fadeUp 1.1s ease-out 0.6s both',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.95rem 1.6rem',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textDecoration: 'none',
    border: 'none',
  },
  btnPrimary: {
    background: colors.accent,
    color: colors.bg,
  },
  btnSecondary: {
    background: 'transparent',
    color: colors.ink,
    border: `1px solid ${colors.borderStrong}`,
  },
  btnGhost: {
    background: 'transparent',
    color: colors.inkMuted,
    border: `1px solid ${colors.border}`,
  },
  btnArrow: {
    transition: 'transform 0.2s',
  },
  heroMeta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '2rem',
    paddingTop: '2rem',
    borderTop: `1px solid ${colors.border}`,
    maxWidth: '720px',
    animation: 'fadeUp 1.2s ease-out 0.75s both',
  },
  metaStat: {},
  metaValue: {
    fontFamily: '"Fraunces", serif',
    fontSize: '2.2rem',
    fontWeight: 400,
    color: colors.ink,
    lineHeight: 1,
    marginBottom: '0.4rem',
  },
  metaLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },

  // Container + sections
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '0 2rem',
  },
  section: {
    padding: '2rem 0',
  },
  sectionHeader: {
    marginBottom: '4rem',
    maxWidth: '680px',
  },
  sectionLabel: {
    display: 'block',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    color: colors.moss,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    marginBottom: '1rem',
  },
  h2: {
    fontFamily: '"Fraunces", serif',
    fontSize: 'clamp(2rem, 4vw, 3rem)',
    fontWeight: 300,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    margin: 0,
  },

  // Manifesto
  manifestoSection: {
    padding: '8rem 0 6rem',
    background: colors.bgAlt,
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
  },
  manifestoGrid: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    gap: '3rem',
  },
  manifestoAside: {
    paddingTop: '1rem',
  },
  manifestoBody: {
    maxWidth: '680px',
  },
  manifestoLead: {
    fontFamily: '"Fraunces", serif',
    fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
    lineHeight: 1.3,
    fontWeight: 300,
    margin: '0 0 2rem',
    color: colors.ink,
    letterSpacing: '-0.01em',
  },
  manifestoProse: {
    fontSize: '1.1rem',
    lineHeight: 1.7,
    color: colors.inkMuted,
    margin: '0 0 1.5rem',
  },
  code: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '0.9em',
    color: colors.accent,
    background: colors.bgCard,
    padding: '0.1em 0.4em',
    borderRadius: '2px',
    border: `1px solid ${colors.border}`,
  },

  // Features
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1.5rem',
  },
  featureCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    padding: '2rem',
    borderRadius: '2px',
    position: 'relative',
    transition: 'all 0.3s',
  },
  featureHex: {
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.moss,
    marginBottom: '1.5rem',
    border: `1px solid ${colors.border}`,
    borderRadius: '2px',
  },
  featureTitle: {
    fontFamily: '"Fraunces", serif',
    fontSize: '1.4rem',
    fontWeight: 400,
    margin: '0 0 0.75rem',
    letterSpacing: '-0.01em',
  },
  featureBody: {
    fontSize: '0.95rem',
    lineHeight: 1.65,
    color: colors.inkMuted,
    margin: '0 0 1.5rem',
  },
  featureTag: {
    display: 'inline-block',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    color: colors.inkFaint,
    padding: '0.3rem 0.6rem',
    border: `1px solid ${colors.border}`,
    borderRadius: '2px',
  },

  // Steps
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  step: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr 80px',
    gap: '2.5rem',
    padding: '2.5rem 0',
    borderTop: `1px solid ${colors.border}`,
    alignItems: 'center',
  },
  stepNumber: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    color: colors.moss,
    letterSpacing: '0.1em',
  },
  stepContent: {
    maxWidth: '560px',
  },
  stepTitle: {
    fontFamily: '"Fraunces", serif',
    fontSize: '1.6rem',
    fontWeight: 400,
    margin: '0 0 0.6rem',
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
  },
  stepBody: {
    fontSize: '1rem',
    lineHeight: 1.65,
    color: colors.inkMuted,
    margin: 0,
  },
  stepGlyph: {
    color: colors.moss,
    justifySelf: 'end',
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
    lineHeight: 1.7,
    color: colors.inkMuted,
    margin: '0 0 2rem',
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
    gap: '0.75rem',
    color: colors.ink,
    fontSize: '1rem',
    lineHeight: 1.6,
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
    animation: 'pulse 2s ease-in-out infinite',
  },
  mono: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    color: colors.inkMuted,
    letterSpacing: '0.02em',
  },
  codeBlock: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    lineHeight: 1.7,
    color: colors.moss,
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
    transition: 'background 0.2s',
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
    fontFamily: '"Fraunces", serif',
    fontSize: '1.25rem',
    fontWeight: 400,
    textAlign: 'left',
    cursor: 'pointer',
    letterSpacing: '-0.01em',
  },
  faqIcon: {
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.moss,
    fontSize: '1.5rem',
    fontWeight: 300,
    transition: 'transform 0.3s',
    marginLeft: '1rem',
    flexShrink: 0,
  },
  faqAnswer: {
    fontSize: '1rem',
    lineHeight: 1.7,
    color: colors.inkMuted,
    margin: '0 0 1.75rem',
    maxWidth: '720px',
  },

  // Footer
  footer: {
    marginTop: '8rem',
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
    lineHeight: 1.6,
    maxWidth: '320px',
    margin: '1rem 0 0',
  },
  footerCols: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '2rem',
  },
  footerColTitle: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    color: colors.moss,
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
    color: colors.inkMuted,
    textDecoration: 'none',
    fontSize: '0.9rem',
    transition: 'color 0.2s',
  },
  footerBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '2rem',
    borderTop: `1px solid ${colors.border}`,
    color: colors.inkFaint,
    fontSize: '12px',
  },
};