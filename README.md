# SOND3R

A local-first agentic music browser.

## Prerequisites

0. Install [pnpm](https://pnpm.io/installation)
1. Setup environment variables from within the `app` directory:
   1. `cp env.local .env`
   2. If you want to enable search on Youtube, you must create an app on the GCP console and get an api key

## Build

The client is inside the `app` directory and can be built with `pnpm`:

```
cd app
pnpm i 
pnpm dev
```

## License

Apache-2.0