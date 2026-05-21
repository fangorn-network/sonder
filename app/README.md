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
```

#### Install OS-level Deps

-Install yt-dlp and ffmpeg

Linux/WSL2

``` sh
pip install yt-dlp
# Update yt-dlp to nightly in WSL2
yt-dlp --update-to nightly
# verify ffmpeg installation
which ffmpeg || sudo apt install ffmpeg -y
```

Windows

``` sh
# install python >=3.12 with winget or conda
winget install Python.Python.3.12
# with conda
conda install python=3.12

# install yt-dlp
winget install yt-dlp.yt-dlp
# restart the terminal, then run
yt-dlp --update-to nightly
winget install DenoLand.Deno

pip install yt-dlp-ejs

# if you have multiple versions of python install
py -3.12 -m pip install yt-dlp-ejs
yt-dlp --allow-unplayable-formats --remote-components ejs:github "https://www.youtube.com/watch?v=BaW_jenozKc"
# verify functionality
yt-dlp --verbose "https://www.youtube.com/watch?v=BaW_jenozKc" 2>&1 | Select-String "javascript\|deno\|ejs"
```

### Install

We recommend using a linux environment for an optimal developer exeperience.

##### Linux
```bash
$ pnpm install
```

#### Windows

``` bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\install_windows.ps1
```
See [troubleshooting](#troubleshooting) for common issues encountered when building on windows. 

### Development

```bash
$ pnpm dev
``` 

### Chroma DB
Chroma DB uses python which requries a binary to be built


#### Linux
Navigate to `vectordb` and activate your venv

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

If needed, install `pyinstaller`
```bash
pip install pyinstaller
```

Then build your binary
```bash
pyinstaller --onefile --name server \
  $(pip list --format=freeze | cut -d= -f1 | xargs -I{} echo "--collect-submodules {}") \
  server.py
```

#### Windows

Windows operates slightly differently.

```sh
python -m venv venv
.\venv\Scripts\activate
# install reqs
pip install -r requirements.txt
pip install pyinstaller
pyinstaller --onefile --name server $(pip list --format=freeze | cut -d= -f1 | xargs -I{} echo "--collect-submodules {}") server.py
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

#### Troubleshooting
1. (Linux) Electron sandbox issue
To fix, run
```sh
sudo chown root:root ./node_modules/.pnpm/electron@39.8.9/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 ./node_modules/.pnpm/electron@39.8.9/node_modules/electron/dist/chrome-sandbox
```

2. (Windows)  
- Windows handles pnpm's default hard-linking terribly under heavy I/O. Forcing pnpm to use standard copies will usually bypass the freeeze instantly. 
``` sh
pnpm config set package-import-method copy
pnpm config set node-linker hoisted
```
Then, run `pnpm i --network-currency 4`
- Windows defender struggles with node_modules. When pnpm attempts to create 2000+ files and link, defender can panic and scan every single one, creating a massive I/O bottleneck and freezing the installation completely. If it is still slow, try disabling realtime protection in windows defender temporarily and it should be resolved. Don't forget to re-enable realtime protection when you're done. 
  - It will automatically turn back on after some time, so you have to keep an eye on this if you're doing multiple builds. 