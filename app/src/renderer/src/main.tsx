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

const PRIVY_APP_ID = (import.meta as any).env.VITE_PRIVY_APP_ID as string | undefined;

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID ?? ''}
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
        // Active chain — Arbitrum Sepolia everywhere until we deploy on
        // Arbitrum One (override via VITE_NETWORK). See lib/network.ts.
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