/**
 * network.ts
 *
 * Single source of truth for which chain + token contracts the app talks to.
 *
 * We are not deployed on Arbitrum One yet, so every build — `yarn dev` and
 * packaged production alike — currently defaults to **Arbitrum Sepolia**
 * testnet USDC. Once mainnet is live, flip the default back in
 * `resolveNetwork()`. Force either chain with
 * `VITE_NETWORK=arbitrumSepolia | arbitrum`.
 *
 * Note: the Fangorn protocol (publish / x402) is currently only deployed on
 * Arbitrum Sepolia. On mainnet those flows degrade gracefully (`fangorn` /
 * `facilitator` are undefined); wallet balances + funding still work.
 */

import { createPublicClient, http, parseAbi, type Hex } from 'viem'
import { arbitrum, arbitrumSepolia, type Chain } from 'viem/chains'
import { FangornConfig, type AppConfig } from '@fangorn-network/sdk'
import type { FundWalletConfig } from '@privy-io/react-auth'

/** ERC-20 read ABI shared by USDC balance lookups. */
export const USDC_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])

/** USDC has 6 decimals on every chain Circle deploys to. */
export const USDC_DECIMALS = 6

export type NetworkKey = 'arbitrumSepolia' | 'arbitrum'

export interface NetworkConfig {
  key: NetworkKey
  label: string
  chain: Chain
  testnet: boolean
  /** Circle-native USDC contract on this chain. */
  usdc: Hex
  /** EIP-712 domain name for USDC — used by x402 payment signing. */
  usdcDomainName: string
  /** JSON-RPC endpoint (env override falls back to the public RPC). */
  rpcUrl: string
  /** x402 settlement facilitator — only set where Fangorn is deployed. */
  facilitator?: Hex
  /** Fangorn protocol registry config — only set where Fangorn is deployed. */
  fangorn?: AppConfig
}

const env = (import.meta as any).env

const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    label: 'Arbitrum Sepolia',
    chain: arbitrumSepolia,
    testnet: true,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    usdcDomainName: 'USD Coin',
    rpcUrl: env.VITE_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    facilitator: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6',
    fangorn: FangornConfig.ArbitrumSepolia,
  },
  arbitrum: {
    key: 'arbitrum',
    label: 'Arbitrum One',
    chain: arbitrum,
    testnet: false,
    // Circle-native USDC on Arbitrum One (not bridged USDC.e).
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    usdcDomainName: 'USD Coin',
    rpcUrl: env.VITE_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    // Fangorn protocol + x402 facilitator are not yet deployed on mainnet.
  },
}

function resolveNetwork(): NetworkConfig {
  const override = (env.VITE_NETWORK as string | undefined)?.trim()
  if (override && override in NETWORKS) return NETWORKS[override as NetworkKey]
  // We are not deployed on Arbitrum One yet, so default everything — including
  // packaged builds — to Arbitrum Sepolia for now. Force mainnet explicitly
  // with VITE_NETWORK=arbitrum once we're live there.
  return NETWORKS.arbitrumSepolia
}

/** The active network for this build/run. */
export const NETWORK = resolveNetwork()

/** Shared read-only client for balance lookups on the active chain. */
export const publicClient = createPublicClient({
  chain: NETWORK.chain,
  transport: http(NETWORK.rpcUrl),
})

/**
 * Privy on-ramp config that funds USDC on the active chain. Pass to
 * `fundWallet({ address, options: usdcFundingOptions() })`.
 *
 * - Testnet (`yarn dev`): only devs use it, so just open the standard modal
 *   and let them pick (card on-ramps are sandboxed here anyway).
 * - Mainnet: casual users who likely don't hold crypto — open straight to the
 *   familiar debit/credit-card on-ramp (MoonPay) so "send USD → get USDC"
 *   is one tap, rather than surfacing exchange/external-wallet options.
 *
 * @param amount default amount (in USDC) to pre-fill in the funding modal.
 */
export function usdcFundingOptions(amount = '10'): FundWalletConfig {
  const base = { chain: { id: NETWORK.chain.id }, asset: 'USDC' as const, amount }
  if (NETWORK.testnet) return base
  return { ...base, defaultFundingMethod: 'card', card: { preferredProvider: 'moonpay' } }
}
