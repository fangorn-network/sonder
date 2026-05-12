import { usePrivy, useFundWallet, useWallets } from '@privy-io/react-auth'
import { createPublicClient, createWalletClient, http, custom, parseAbi, formatUnits } from 'viem'
import { arbitrumSepolia } from 'viem/chains'
import { useEffect, useState } from 'react'
import '../App.css'

const USDC_ADDRESS = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
const TARGET_CONTRACT = '0x14cff4b583cabde7066d12f04bf9eaba408a426f'

const USDC_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])
const CONTRACT_ABI = parseAbi([
  'function publish(string manifest_cid, bytes32 schema_id, string name, uint256 price) public'
])

const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http("https://sepolia-rollup.arbitrum.io/rpc")
})

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
  const { wallets } = useWallets() 
  const { fundWallet } = useFundWallet({ onUserExited: () => { } })
  
  const [balance, setBalance] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hidden, setHidden] = useState(true)

  const address = user?.wallet?.address as `0x${string}` | undefined
  const label = user?.email?.address
    ?? (user as any)?.google?.email
    ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '')

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')

  const handlePublish = async () => {
    if (!embeddedWallet || !address) return

    try {
      const provider = await embeddedWallet.getEthereumProvider()
      const walletClient = createWalletClient({
        account: address,
        chain: arbitrumSepolia,
        transport: custom(provider) 
      })

      const hash = await walletClient.writeContract({
        address: TARGET_CONTRACT,
        abi: CONTRACT_ABI,
        functionName: 'publish',
        args: [
          'bafkreidyfq3aq4pcalvj7hptynlpkkpth3ju4bqg3b5hau34wwr5ivzmda',
          '0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6',
          '2gY3Z3f1Qe4vWnw15dBkSw',
          0n
        ],
      })
      console.log("Success:", hash)
    } catch (error) {
      console.error("Write Error:", error)
    }
  }

  function handleCopyAddress() {
    if (!address || hidden) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
        <button className="wallet-label" onClick={handleCopyAddress}>
          {hidden ? null : copied ? 'copied!' : label}
        </button>
        {balance !== null && !hidden && (
          <span className="wallet-balance" onClick={() => address && fundWallet({ address })}>
            <span className="wallet-balance-currency">$</span>
            {Number(balance).toFixed(2)}
            <span className="wallet-balance-unit"> USDC</span>
          </span>
        )}
        <button className="wallet-hide-btn" onClick={() => setHidden(h => !h)}>
          <EyeIcon hidden={hidden} />
        </button>
        {!hidden && <button onClick={handlePublish}>Publish</button>}
        <button className="wallet-logout" onClick={logout}>✕</button>
      </div>
    )
  }

  return <button className="btn-connect" onClick={login}>Connect</button>
}