# SOND3R

It turns music from a background utility into a participatory sport.

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Prerequisites

Setup environment variables

``` sh
touch .env
```

and paste

``` 
VITE_ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/5-t8t4AW4wknuQUzuDb1B
VITE_USE_AGENT=true
VITE_YOUTUBE_API_KEY=
```

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

You can build an executable on a per-OS basis. 

**IMPORTANT**: The executable will allow the `.env` file to be locally editable. Be careful not to include any secret information in the .env. 

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

> Note: If work is being performed that requires changes to the agent, tools, or agent-types, add the following to pnpm section of package.json replaced with the location to the relevant projects
```json
"overrides": {
  "@fangorn-network/agent": "link:../../agent/agent",
  "@fangorn-network/agent-tools": "link:../../agent/tools",
  "@fangorn-network/agent-types": "link:../../agent/agent-types"
}
```

#### Known Issues:
1. (Linux) Electron sandbox issue
To fix, run
```sh
sudo chown root:root ./node_modules/.pnpm/electron@39.8.9/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 ./node_modules/.pnpm/electron@39.8.9/node_modules/electron/dist/chrome-sandbox
```