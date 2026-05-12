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
])

function serializeParams(params: unknown): unknown {
  return JSON.parse(
    JSON.stringify(params, (_, v) =>
      typeof v === 'bigint' ? '0x' + v.toString(16) : v
    )
  )
}

export function useFangorn(): UseFangornResult {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()

  const [fangorn, setFangorn] = useState<Fangorn | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wallet = wallets[0]
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
      const rpcUrl = (import.meta as any).env.VITE_ARBITRUM_SEPOLIA_RPC_URL

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
          fees: {
            baseFeeMultiplier: 1.5,
          },
        },
        transport: ipcTransport,
      })

      const patchedConfig = {
        ...FangornConfig.ArbitrumSepolia,
        chain: {
          ...FangornConfig.ArbitrumSepolia.chain,
          rpcUrls: {
            default: { http: [(import.meta as any).env.VITE_ARBITRUM_SEPOLIA_RPC_URL] },
            public: { http: [(import.meta as any).env.VITE_ARBITRUM_SEPOLIA_RPC_URL] },
          },
        },
      }

      const fangornInstance = await Fangorn.create({
        walletClient: wc,
        config: patchedConfig,
        storage: {
          pinata: {
            jwt: (import.meta as any).env.VITE_PINATA_JWT ?? '',
            gateway: (import.meta as any).env.VITE_PINATA_GATEWAY ?? '',
          },
        },
        // config: FangornConfig.ArbitrumSepolia,
        domain: window.location.host,
      })

      if (cancelled) return

      setWalletClient(wc)
      setFangorn(fangornInstance)
    }

    init()
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [privyReady, wallet?.address])

  return {
    fangorn,
    walletClient,
    address: (wallet?.address as Hex) ?? null,
    loading,
    error,
  }
}