import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { formatUnits } from 'viem'
import { useEffect, useState } from 'react'
import '../App.css'
import { NETWORK, USDC_ABI, USDC_DECIMALS, publicClient, usdcFundingOptions } from '../lib/network'

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function ConnectWallet() {
  const { login, logout, authenticated, user } = usePrivy()
  const { fundWallet } = useFundWallet({ onUserExited: () => { } })
  
  const [balance, setBalance] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hidden, setHidden] = useState(true)

  const address = user?.wallet?.address as `0x${string}` | undefined
  const label = user?.email?.address
    ?? (user as any)?.google?.email
    ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '')

  function handleCopyAddress() {
    if (!address || hidden) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    if (!address) { setBalance(null); return }
    publicClient.readContract({
      address: NETWORK.usdc,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [address],
    })
      .then(raw => setBalance(formatUnits(raw, USDC_DECIMALS)))
      .catch(console.error)
  }, [address])

  if (authenticated) {
    return (
      <div className="wallet-chip connected">
        <span className="wallet-dot" />
        <button className="wallet-label" onClick={handleCopyAddress}>
          {hidden ? null : copied ? 'copied!' : label}
        </button>
        {balance !== null && !hidden && (
          <span className="wallet-balance" onClick={() => address && fundWallet({ address, options: usdcFundingOptions() })}>
            <span className="wallet-balance-currency">$</span>
            {Number(balance).toFixed(2)}
            <span className="wallet-balance-unit"> USDC</span>
          </span>
        )}
        <button className="wallet-hide-btn" onClick={() => setHidden(h => !h)}>
          <EyeIcon hidden={hidden} />
        </button>
        <button className="wallet-logout" onClick={logout}>✕</button>
      </div>
    )
  }

  return <button className="btn-connect" onClick={login}>Connect</button>
}