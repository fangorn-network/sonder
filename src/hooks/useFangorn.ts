import { useState, useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { Fangorn, FangornConfig } from '@fangorn-network/sdk'
// import {  } from '../config'
import type { Hex } from 'viem'

export interface UseFangornResult {
  fangorn: Fangorn | null
  walletClient: WalletClient | null
  address: Hex | null
  loading: boolean
  error: string | null
}

export function useFangorn(): UseFangornResult {
  const { wallets } = useWallets()
  const [fangorn, setFangorn] = useState<Fangorn | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wallet = wallets[0]

  useEffect(() => {
    if (!wallet) {
      setFangorn(null)
      setWalletClient(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const init = async () => {
      const provider = await wallet.getEthereumProvider()

      const wc = createWalletClient({
        account: wallet.address as Hex,
        chain: {
          ...FangornConfig.ArbitrumSepolia.chain,
          fees: {
            baseFeeMultiplier: 1.5,
          },
        },
        transport: custom(provider),
      })

      const fangorn = await Fangorn.create({
        walletClient: wc,
        storage: {
          pinata: {
            jwt: import.meta.env.VITE_PINATA_JWT ?? '',
            gateway: import.meta.env.VITE_PINATA_GATEWAY ?? ''
          }
        },
        encryption: { lit: true },
        config: FangornConfig.ArbitrumSepolia,
        domain: window.location.host,
      })

      if (cancelled) return
      setWalletClient(wc)
      setFangorn(fangorn)
    }

    init()
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [wallet?.address])

  return {
    fangorn,
    walletClient,
    address: (wallet?.address as Hex) ?? null,
    loading,
    error,
  }
}