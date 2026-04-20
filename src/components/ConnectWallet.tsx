import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { arbitrumSepolia } from 'viem/chains'
import { FangornConfig } from '@fangorn-network/sdk'
import { useEffect, useState } from 'react'
import '../App.css'

const USDC_ADDRESS = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
const USDC_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])

const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(FangornConfig.ArbitrumSepolia.rpcUrl)
})

export function ConnectWallet() {
  const { login, logout, authenticated, user } = usePrivy()
  const { fundWallet } = useFundWallet({
    onUserExited: () => { },
  })
  const [balance, setBalance] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)

  function handleCopyAddress() {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }


  const address = user?.wallet?.address as `0x${string}` | undefined
  const label = user?.email?.address
    ?? (user as any)?.google?.email
    ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '')

  useEffect(() => {
    if (!address) { setBalance(null); return }
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [address],
    })
      .then(raw => setBalance(formatUnits(raw, 6)))
      .catch(console.error)
  }, [address])

  if (authenticated) {
    return (
      <div className="wallet-chip connected">
        <span className="wallet-dot" />
        <button className="wallet-label" onClick={handleCopyAddress} title={address}>
          {copied ? 'copied!' : label}
        </button>
        {balance !== null && (
          <span
            className="wallet-balance"
            onClick={async () => address && await fundWallet({ address })}
            title="Click to add funds"
            style={{ cursor: 'pointer' }}
          >
            <span className="wallet-balance-currency">$</span>
            {Number(balance).toFixed(2)}
            <span className="wallet-balance-unit"> USDC</span>
          </span>
        )}
        <button className="wallet-logout" onClick={logout}>✕</button>
      </div>
    )
  }

  return (
    <button className="btn-connect" onClick={login}>
      Connect
    </button>
  )
}