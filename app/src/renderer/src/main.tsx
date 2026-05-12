import React from 'react';
import ReactDOM from 'react-dom/client';
// import { Buffer } from 'buffer'
// globalThis.Buffer = Buffer
// window.Buffer = Buffer
import './index.css';
import { PrivyProvider } from '@privy-io/react-auth';
import { arbitrumSepolia } from 'viem/chains';
import App from './App';
// import * as THREE from 'three'
// ;(window as any).THREE = THREE

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId="cmmmmq70j01du0djr5foaef5x"
      config={{
        // Embedded wallets for users who don't have one
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true, // false for production
          },
        },
        // Default chain — Arbitrum Sepolia for fangorn.music
        defaultChain: arbitrumSepolia,
        supportedChains: [arbitrumSepolia],
        appearance: {
          theme: 'dark',
          accentColor: '#c7e8b3',
          logo: '/fangorn-mark.svg',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email', 'spotify'],
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);