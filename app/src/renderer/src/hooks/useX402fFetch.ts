import { FangornX402Middleware } from '@fangorn-network/fetch'
import { useWallets } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { createWalletClient, custom, keccak256, toBytes, type Hex } from 'viem'
import { NETWORK } from '../lib/network'

export function useFangornMiddleware() {
    const { wallets } = useWallets()
    const [middleware, setMiddleware] = useState<FangornX402Middleware | null>(null)

    useEffect(() => {
        const wallet = wallets[0]
        // Fangorn protocol (x402 paywalls) is only deployed where `fangorn` +
        // `facilitator` are configured — Arbitrum Sepolia today.
        if (!wallet || !NETWORK.fangorn || !NETWORK.facilitator) { setMiddleware(null); return }
        const { fangorn, facilitator } = NETWORK

        wallet.getEthereumProvider()
            .then(async provider => {
                const walletClient = createWalletClient({
                    account: wallet.address as `0x${string}`,
                    chain: fangorn.chain,
                    transport: custom(provider),
                }) as any

                // const signature = await walletClient.signMessage({
                //     account: wallet.address as `0x${string}`,
                //     message: 'fangorn:identity:v1',
                // })
                const cacheKey = `fangorn:identity:${wallet.address}`
                const cached = localStorage.getItem(cacheKey) as Hex | null

                let identitySecret: Hex
                if (cached) {
                    identitySecret = cached
                } else {
                    const sig = await walletClient.signMessage({
                        account: wallet.address as `0x${string}`,
                        message: 'fangorn:identity:v1',
                    })
                    identitySecret = keccak256(toBytes(sig))
                    localStorage.setItem(cacheKey, identitySecret)
                }

                // const identity = new Identity(identitySecret)

                return FangornX402Middleware.create({
                    walletClient: walletClient as any,
                    // identity,
                    usdcContractAddress: NETWORK.usdc,
                    usdcDomainName: NETWORK.usdcDomainName,
                    facilitatorAddress: facilitator,
                    config: fangorn,
                    domain: window.location.host,
                })
            })
            .then(setMiddleware)
            .catch(console.error)
    }, [wallets[0]?.address])

    return middleware
}