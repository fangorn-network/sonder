import { FangornX402Middleware } from '@fangorn-network/fetch'
import { FangornConfig } from '@fangorn-network/sdk'
import { useWallets } from '@privy-io/react-auth'
import { Identity } from '@semaphore-protocol/identity'
import { useEffect, useState } from 'react'
import { createWalletClient, custom, keccak256, toBytes, type Hex } from 'viem'


const MIDDLEWARE_CONFIG = {
    usdcContractAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as const,
    usdcDomainName: 'USD Coin',
    facilitatorAddress: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6' as const,
    config: FangornConfig.ArbitrumSepolia,
    domain: window.location.host,
}

export function useFangornMiddleware() {
    const { wallets } = useWallets()
    const [middleware, setMiddleware] = useState<FangornX402Middleware | null>(null)

    useEffect(() => {
        const wallet = wallets[0]
        if (!wallet) { setMiddleware(null); return }

        wallet.getEthereumProvider()
            .then(async provider => {
                const walletClient = createWalletClient({
                    account: wallet.address as `0x${string}`,
                    chain: FangornConfig.ArbitrumSepolia.chain,
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

                const identity = new Identity(identitySecret)

                return FangornX402Middleware.create({
                    walletClient: walletClient as any,
                    identity,
                    ...MIDDLEWARE_CONFIG,
                })
            })
            .then(setMiddleware)
            .catch(console.error)
    }, [wallets[0]?.address])

    return middleware
}