/**
 * AccountView.tsx
 *
 * Account management — renders inline inside the settings drawer ("account"
 * section). Sensitive flows (email update, MFA enrollment, key export,
 * funding) all route through Privy's hosted modals; this view is the chrome
 * around them plus read-only account/wallet state.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  usePrivy,
  useWallets,
  useCreateWallet,
  useFundWallet,
  useMfaEnrollment,
  useExportWallet,
} from '@privy-io/react-auth'
import { formatUnits, formatEther } from 'viem'
import { NETWORK, USDC_ABI, USDC_DECIMALS, publicClient, usdcFundingOptions } from '../lib/network'
import { BugReportModal } from '../components/BugReportModal'

const MFA_LABELS: Record<string, string> = {
  sms: 'SMS',
  totp: 'Authenticator app',
  passkey: 'Passkey',
}

export function AccountView() {
  const {
    ready, authenticated, user,
    login, logout,
    linkEmail, updateEmail,
  } = usePrivy()
  const { wallets } = useWallets()
  const { exportWallet } = useExportWallet()
  const { showMfaEnrollmentModal } = useMfaEnrollment()

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = (user?.wallet?.address ?? embeddedWallet?.address) as `0x${string}` | undefined

  // ── Balances ───────────────────────────────────────────────────────────────

  const [usdcBalance, setUsdcBalance] = useState<string | null>(null)
  const [ethBalance, setEthBalance] = useState<string | null>(null)

  const refreshBalances = useCallback(() => {
    if (!address) { setUsdcBalance(null); setEthBalance(null); return }
    publicClient.readContract({
      address: NETWORK.usdc, abi: USDC_ABI, functionName: 'balanceOf', args: [address],
    })
      .then(raw => setUsdcBalance(formatUnits(raw, USDC_DECIMALS)))
      .catch(console.error)
    publicClient.getBalance({ address })
      .then(raw => setEthBalance(formatEther(raw)))
      .catch(console.error)
  }, [address])

  useEffect(() => { refreshBalances() }, [refreshBalances])

  const { fundWallet } = useFundWallet({ onUserExited: refreshBalances })

  // ── Embedded wallet creation ───────────────────────────────────────────────
  // `createWallet()` rejects on failure; without surfacing it the button is a
  // silent no-op. `onError` hands back a `PrivyErrorCode` (e.g.
  // `allowlist_rejected` if this origin isn't allow-listed in the Privy
  // dashboard, `embedded_wallet_already_exists`, etc.).
  const [walletError, setWalletError] = useState<string | null>(null)
  const { createWallet } = useCreateWallet({
    onSuccess: () => { setWalletError(null); refreshBalances() },
    onError: (error) => {
      console.error('[privy] embedded wallet creation failed:', error)
      setWalletError(String(error))
    },
  })

  // ── Copy-to-clipboard flash ────────────────────────────────────────────────

  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  // ── Sign-out confirmation ──────────────────────────────────────────────────

  const [confirmLogout, setConfirmLogout] = useState(false)

  // ── Bug reporter ────────────────────────────────────────────────────────────

  const [showBugReport, setShowBugReport] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────

  if (!ready) {
    return <Note>loading account…</Note>
  }

  if (!authenticated || !user) {
    return (
      <div>
        <PanelHeading title="ACCOUNT" sub="not signed in" />
        <Note style={{ marginBottom: 'var(--sp-4)' }}>
          Connect to manage your email, wallet, and security settings.
        </Note>
        <button className="studio-submit" style={{ width: '100%' }} onClick={login}>
          connect
        </button>
        {/* Reachable while signed out so a wedged login (e.g. a deleted account
            whose dead session lingers locally) can be cleared without devtools. */}
        <Section label="Trouble signing in?">
          <ResetSessionControl />
        </Section>
        <FeedbackSection onReport={() => setShowBugReport(true)} />
        {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
      </div>
    )
  }

  const mfaMethods = user.mfaMethods ?? []

  return (
    <div>
      <PanelHeading title="ACCOUNT" sub="identity · wallet · security" />

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <Section label="Identity">
        <Row label="Email">
          {user.email ? (
            <ValueWithAction
              value={user.email.address}
              actionLabel="update"
              onAction={updateEmail}
            />
          ) : (
            <ValueWithAction
              value="not linked"
              dim
              actionLabel="link email"
              onAction={linkEmail}
            />
          )}
        </Row>
        <Row label="User ID">
          <ValueWithAction
            value={copied === 'did' ? 'copied!' : truncateMiddle(user.id.replace(/^did:privy:/, ''), 14)}
            mono
            actionLabel="copy"
            onAction={() => copy('did', user.id)}
          />
        </Row>
        <Row label="Member since">
          <Value value={new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} />
        </Row>
      </Section>

      {/* ── Wallet ───────────────────────────────────────────────────────── */}
      {/* Casual-user view: a plain dollar balance + "add funds". Anything
          crypto-flavoured (address, chain, gas, key export) lives under
          Advanced below. */}
      <Section label="Wallet" trailing={address ? <Dot ok label={embeddedWallet ? 'embedded' : 'linked'} /> : <Dot label="none" />}>
        {address ? (
          <>
            <Row label="Balance">
              <Value mono value={usdcBalance !== null ? `$${Number(usdcBalance).toFixed(2)}` : '…'} />
            </Row>
            <Actions>
              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => fundWallet({ address, options: usdcFundingOptions() })}>
                add funds
              </button>
            </Actions>
          </>
        ) : (
          <>
            <Note style={{ padding: 'var(--sp-4)' }}>
              No wallet linked to this account yet.
            </Note>
            <Actions>
              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  setWalletError(null)
                  // Rejection is surfaced via the useCreateWallet onError callback;
                  // catch here only to avoid an unhandled promise rejection.
                  createWallet().catch(() => {})
                }}>
                create embedded wallet
              </button>
            </Actions>
            {walletError && (
              <Note style={{ padding: 'var(--sp-4)', color: '#e57373' }}>
                Couldn't create wallet: {walletError}
              </Note>
            )}
          </>
        )}
      </Section>

      {/* ── Advanced (crypto details) ────────────────────────────────────── */}
      {/* Collapsed by default on mainnet so casual users aren't shown raw
          addresses / gas; expanded on testnet where only devs are looking. */}
      {address && (
        <CollapsibleSection label="Advanced" defaultOpen={NETWORK.testnet}>
          <Row label="Address">
            <ValueWithAction
              value={copied === 'addr' ? 'copied!' : truncateMiddle(address, 16)}
              mono
              actionLabel="copy"
              onAction={() => copy('addr', address)}
            />
          </Row>
          <Row label="Network">
            <Value value={NETWORK.testnet ? `${NETWORK.label} · testnet` : NETWORK.label} dim={NETWORK.testnet} />
          </Row>
          <Row label="ETH (gas)">
            <Value mono value={ethBalance !== null ? Number(ethBalance).toFixed(5) : '…'} />
          </Row>
          {embeddedWallet && (
            <Actions>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => exportWallet({ address: embeddedWallet.address })}>
                export key
              </button>
            </Actions>
          )}
        </CollapsibleSection>
      )}

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <Section label="Security" trailing={<Dot ok={mfaMethods.length > 0} label={mfaMethods.length > 0 ? 'mfa on' : 'mfa off'} />}>
        <Row label="2-factor auth">
          <Value
            value={mfaMethods.length > 0
              ? mfaMethods.map(m => MFA_LABELS[m] ?? m).join(', ')
              : 'not enrolled'}
            dim={mfaMethods.length === 0}
          />
        </Row>
        <Actions>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={showMfaEnrollmentModal}>
            {mfaMethods.length > 0 ? 'manage mfa' : 'enable mfa'}
          </button>
        </Actions>
      </Section>

      {/* ── Feedback ─────────────────────────────────────────────────────── */}
      <FeedbackSection onReport={() => setShowBugReport(true)} />

      {/* ── Session ──────────────────────────────────────────────────────── */}
      <Section label="Session">
        <Actions noBorder>
          {confirmLogout ? (
            <>
              <button
                className="btn-ghost"
                style={{ flex: 1, color: 'var(--err)' }}
                onClick={() => { setConfirmLogout(false); logout() }}>
                confirm sign out
              </button>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmLogout(false)}>
                cancel
              </button>
            </>
          ) : (
            <button
              className="btn-ghost"
              style={{ flex: 1, color: 'var(--err)' }}
              onClick={() => setConfirmLogout(true)}>
              sign out
            </button>
          )}
        </Actions>
        <ResetSessionControl />
      </Section>

      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
    </div>
  )
}

// ─── Feedback / bug report ────────────────────────────────────────────────────
// Early-access affordance: a always-available "report a problem" entry. Rendered
// both signed-in and signed-out so a broken login is still reportable in-app.
function FeedbackSection({ onReport }: { onReport: () => void }) {
  return (
    <Section label="Feedback">
      <Note style={{ padding: 'var(--sp-4)' }}>
        Hit a bug? This is an early access preview — tell us what broke and we’ll
        get on it.
      </Note>
      <Actions>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={onReport}>
          report a problem
        </button>
      </Actions>
    </Section>
  )
}

// ─── Local session reset ──────────────────────────────────────────────────────
// Clears this device's stored Privy session (+ cached app data) and reloads.
// Recovers from a wedged login — e.g. the account was deleted server-side but
// the dead session lingers locally, blocking re-login. Rendered both signed-in
// (Session section) and signed-out (so a wedged login is recoverable in-app,
// without devtools). Main reloads the window, so `resetSession()` typically
// never resolves; the catch only handles the API being unavailable.
function ResetSessionControl() {
  const [confirm, setConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const run = useCallback(async () => {
    setResetting(true)
    try {
      await window.sond3r?.resetSession()
    } catch (e) {
      console.error('[session] reset failed:', e)
      setResetting(false)
      setConfirm(false)
    }
  }, [])

  return (
    <>
      <Actions noBorder>
        {confirm ? (
          <>
            <button
              className="btn-ghost"
              style={{ flex: 1, color: 'var(--err)' }}
              disabled={resetting}
              onClick={run}>
              {resetting ? 'clearing…' : 'confirm reset'}
            </button>
            <button
              className="btn-ghost"
              style={{ flex: 1 }}
              disabled={resetting}
              onClick={() => setConfirm(false)}>
              cancel
            </button>
          </>
        ) : (
          <button
            className="btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setConfirm(true)}>
            reset local session
          </button>
        )}
      </Actions>
      {confirm && (
        <Note style={{ padding: 'var(--sp-4)' }}>
          Clears this device’s stored Privy session and cached app data, then
          reloads. Use this if login gets stuck (e.g. after deleting an
          account). Your account and embedded wallet are recovered on next
          sign-in.
        </Note>
      )}
    </>
  )
}

// ─── Layout atoms ─────────────────────────────────────────────────────────────

function PanelHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 'var(--sp-5)' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: '0.03em',
        lineHeight: 1, color: 'var(--fg)', margin: 0,
      }}>
        {title}
      </h1>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'var(--fg3)', margin: '6px 0 0',
      }}>
        {sub}
      </p>
    </div>
  )
}

function Section({ label, trailing, children }: {
  label: string; trailing?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="studio-section" style={{ marginBottom: 'var(--sp-4)' }}>
      <div className="studio-section-label" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--sp-3) var(--sp-4)',
      }}>
        <span>{label}</span>
        {trailing}
      </div>
      {children}
    </div>
  )
}

function CollapsibleSection({ label, defaultOpen, trailing, children }: {
  label: string; defaultOpen?: boolean; trailing?: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="studio-section" style={{ marginBottom: 'var(--sp-4)' }}>
      <div
        className="studio-section-label"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--sp-3) var(--sp-4)', cursor: 'pointer', userSelect: 'none',
        }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', fontSize: 8, color: 'var(--fg3)',
            transition: 'transform 120ms ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          {label}
        </span>
        {trailing}
      </div>
      {open && children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: 'var(--sp-3) var(--sp-4)',
      borderTop: '1px solid var(--glass-edge)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--fg3)', flexShrink: 0,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function Value({ value, mono, dim }: { value: string; mono?: boolean; dim?: boolean }) {
  return (
    <span style={{
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
      fontSize: mono ? 11 : 12,
      color: dim ? 'var(--fg4)' : 'var(--fg2)',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value}
    </span>
  )
}

function ValueWithAction({ value, mono, dim, actionLabel, onAction }: {
  value: string; mono?: boolean; dim?: boolean; actionLabel: string; onAction: () => void
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Value value={value} mono={mono} dim={dim} />
      <button
        className="btn-ghost"
        onClick={onAction}
        style={{ flexShrink: 0, padding: '3px 8px', fontSize: 9 }}>
        {actionLabel}
      </button>
    </span>
  )
}

function Actions({ noBorder, children }: { noBorder?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 'var(--sp-3) var(--sp-4)',
      borderTop: noBorder ? 'none' : '1px solid var(--glass-edge)',
      display: 'flex', gap: 8, alignItems: 'center',
    }}>
      {children}
    </div>
  )
}

function Dot({ ok, label }: { ok?: boolean; label: string }) {
  const color = ok ? 'var(--success)' : 'var(--fg4)'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: ok ? `0 0 6px ${color}` : 'none',
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
        textTransform: 'uppercase', color,
      }}>
        {label}
      </span>
    </span>
  )
}

function Note({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
      color: 'var(--fg3)', lineHeight: 1.7, margin: 0, ...style,
    }}>
      {children}
    </p>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateMiddle(s: string, keep: number): string {
  if (s.length <= keep * 2 + 1) return s
  return `${s.slice(0, keep)}…${s.slice(-Math.max(4, Math.floor(keep / 3)))}`
}
