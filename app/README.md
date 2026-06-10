# SOND3R

It turns music from a background utility into a participatory sport.

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Quick start

Requirements: **Node 22** (Corepack enables Yarn 4), **Python 3.12+**, and `tar` on your PATH. `ffmpeg` is optional (audio extraction).

```bash
yarn install   # deps + native-module rebuild
yarn dev       # first run auto-provisions the dev backend, then launches
```

That's the whole flow. The first `yarn dev` runs a one-time setup (`scripts/setup.mjs`, also available as `yarn setup`) that provisions everything a fresh clone is missing, **per-OS**:

- **`.env`** — copied from `.env.example`. Fill in real values to enable auth / Firebase / Spotify / catalog features; the app still launches with blanks.
- **yt-dlp** → `resources/bin/<os>/`.
- **Qdrant** sidecar engine (pinned `v1.18.2`) → downloaded + extracted to `resources/qdrant/<os>/`.
- **Python venv** → `vectordb/venv` created and `requirements.txt` installed (powers the vector-search query server). Don't need search? `SKIP_PY_SETUP=1 yarn dev`.

Setup is idempotent (re-runs fetch only what's missing) and never blocks `yarn dev` — anything it can't provision degrades gracefully with a `⚠` warning.

> **Linux:** dev runs Electron with `--no-sandbox`, so there's no root `chown/chmod 4755` step on `chrome-sandbox`. Packaged builds keep the Chromium sandbox.

### Environment variables

`.env` is generated for you from `.env.example` (the full list lives there). To actually exercise the integrations you'll need real credentials: a Spotify client/secret, a Graph API key, and Pinata/Firebase values.

### The server binary (release builds only)

`yarn dev` runs the Python server straight from `vectordb/venv`. **Packaged** builds instead bundle a PyInstaller binary at `vectordb/dist/<os>/server`. CI builds this automatically (see `.github/workflows/build.yml`); you only need it for a local `yarn build:*`:

```bash
cd vectordb && source venv/bin/activate && pip install pyinstaller
pyinstaller --onefile --name server --distpath dist/<os> \
  $(pip list --format=freeze | cut -d= -f1 | xargs -I{} echo "--collect-submodules {}") \
  server.py
```

### Build

You can build an executable on a per-OS basis. 

**IMPORTANT**: The executable will allow the `.env` file to be locally editable. Be careful not to include any secret information in the .env. 

#### Linux and Mac
```bash

# For macOS
$ yarn build:mac

# For Linux
$ yarn build:linux
```

#### Windows
First, ensure Wine is installed
```bash
# Ubuntu/Debian
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install wine64 wine32
```
Then build
```bash
# For windows
$ yarn build:win
```

### Publishing
Refer to: https://www.electron.build/docs/publish/#recommended-github-releases-workflow
