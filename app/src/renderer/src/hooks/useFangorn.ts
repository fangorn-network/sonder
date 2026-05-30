import { useState, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { Fangorn, FangornConfig } from '@fangorn-network/sdk'
import type { Hex } from 'viem'

export interface UseFangornResult {
  fangorn: Fangorn | null
  walletClient: WalletClient | null
  address: Hex | null
  loading: boolean
  error: string | null
}

const SIGNING_METHODS = new Set([
  'eth_signTypedData_v4',
  'eth_sign',
  'personal_sign',
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_requestAccounts',
  'eth_accounts',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_sendTransaction',
])

function getPinataConfig(): { jwt: string; gateway: string } {
  try {
    const raw = localStorage.getItem('sond3r:pinata:config')
    const cfg = raw ? JSON.parse(raw) : null
    return { jwt: cfg?.jwt ?? '', gateway: cfg?.gateway ?? '' }
  } catch {
    return { jwt: '', gateway: '' }
  }
}

export function useFangorn(): UseFangornResult {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()

  const [fangorn,      setFangorn]      = useState<Fangorn | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Reactive — re-initializes Fangorn when the user saves Pinata creds
  const [pinataKey, setPinataKey] = useState(
    () => localStorage.getItem('sond3r:pinata:config')
  )

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'sond3r:pinata:config') setPinataKey(e.newValue)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const wallet     = wallets[0]
  const privyReady = ready && authenticated

  useEffect(() => {
    if (!privyReady || !wallet) {
      setFangorn(null)
      setWalletClient(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const init = async () => {
      const provider = await wallet.getEthereumProvider()
      const rpcUrl   = (import.meta as any).env.VITE_ARBITRUM_SEPOLIA_RPC_URL

      const ipcTransport = custom({
        async request({ method, params }) {
          if (SIGNING_METHODS.has(method)) {
            return provider.request({ method, params } as any)
          }
          const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              { jsonrpc: '2.0', id: 1, method, params },
              (_, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v)
            ),
          })
          const data = await res.json()
          if (data.error) throw data.error
          return data.result
        },
      })

      const wc = createWalletClient({
        account: wallet.address as Hex,
        chain: {
          ...FangornConfig.ArbitrumSepolia.chain,
          fees: { baseFeeMultiplier: 1.5 },
        },
        transport: ipcTransport,
      })

      const patchedConfig = {
        ...FangornConfig.ArbitrumSepolia,
        chain: {
          ...FangornConfig.ArbitrumSepolia.chain,
          rpcUrls: {
            default: { http: [rpcUrl] },
            public:  { http: [rpcUrl] },
          },
        },
        datasourceRegistryContractAddress: '0x9472e5c96bcc954817d2dfa32787d32f4ef37496' as Hex,
        settlementRegistryContractAddress: '0x43b660632c31e85a34bbce4feb8aa999029a19b2' as Hex,
        schemaRegistryContractAddress: '0x5373759adecfbce57518fa4c198412012e1bf380' as Hex

      }

      const fangornInstance = await Fangorn.create({
        walletClient: wc,
        config:       patchedConfig,
        storage: {
          pinata: getPinataConfig(),  // reads from localStorage at init time
        },
        domain: window.location.host,
      })

      if (cancelled) return
      setWalletClient(wc)
      setFangorn(fangornInstance)
      
    }

    init()
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [privyReady, wallet?.address, pinataKey])  // re-runs when pinata creds change

  return {
    fangorn,
    walletClient,
    address: (wallet?.address as Hex) ?? null,
    loading,
    error,
  }
}