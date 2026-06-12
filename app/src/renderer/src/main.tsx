import React from 'react';
import ReactDOM from 'react-dom/client';
// import { Buffer } from 'buffer'
// globalThis.Buffer = Buffer
// window.Buffer = Buffer
import './index.css';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App';
import { NETWORK } from './lib/network';
// import * as THREE from 'three'
// ;(window as any).THREE = THREE

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId="cmqad9j9b00i10cl7apzw6rq8"
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
            // Sandbox on testnet, live on-ramp on mainnet.
            useSandbox: NETWORK.testnet,
          },
        },
        // Active chain — Arbitrum Sepolia under `yarn dev`, Arbitrum One in
        // packaged builds (override via VITE_NETWORK). See lib/network.ts.
        defaultChain: NETWORK.chain,
        supportedChains: [NETWORK.chain],
        appearance: {
          theme: 'dark',
          accentColor: '#c7e8b3',
          logo: '/fangorn-mark.svg',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email'],
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);