import React from 'react';
import ReactDOM from 'react-dom/client';
// import { Buffer } from 'buffer'
// globalThis.Buffer = Buffer
// window.Buffer = Buffer

import './index.css';

import { PrivyProvider } from '@privy-io/react-auth';

import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <PrivyProvider
      appId="cmmmmq70j01du0djr5foaef5x"
      config={{
        // Create embedded wallets for users who don't have a wallet
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: {
            createOnLogin: 'users-without-wallets'
          }
        },
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true, // false for production
          }
        }
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);