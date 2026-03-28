// import { useState, useEffect } from 'react'
// import { useWallets } from '@privy-io/react-auth'
// import { createFangornMiddleware } from '../../../x402f/packages/fetch/dist/index.js'
// import type { FangornMiddleware } fro../types.jspes'
// import { CHAIN_CONFIG, FANGORN_CONFIG } fro../config.jsfig';

// export function useFangornMiddleware(): { middleware: FangornMiddleware | null; loading: boolean } {
//   const { wallets } = useWallets()
//   const [middleware, setMiddleware] = useState<FangornMiddleware | null>(null)
//   const [loading, setLoading] = useState(false)

//   const wallet = wallets[0]

//   useEffect(() => {
//     if (!wallet) { setMiddleware(null); return }
//     setLoading(true)

//     wallet.getEthereumProvider()
//       .then(async (provider) => {
//         const { createWalletClient, custom } = await import('viem')
//         const walletClient = createWalletClient({
//           account: wallet.address as `0x${string}`,
//           chain: CHAIN_CONFIG.chain,
//           transport: custom(provider),
//         })
//         return createFangornMiddleware(
//           walletClient as any,
//           CHAIN_CONFIG,
//           window.location.host,
//           FANGORN_CONFIG.pinataJwt,
//           FANGORN_CONFIG.pinataGateway,
//         )
//       })
//       .then(setMiddleware)
//       .catch(console.error)
//       .finally(() => setLoading(false))
//   }, [wallet?.address])

//   return { middleware, loading }
// }