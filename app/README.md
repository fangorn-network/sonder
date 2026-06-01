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
$ yarn install
```

#### Windows

``` bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\install_windows.ps1
```
See [troubleshooting](#troubleshooting) for common issues encountered when building on windows. 

### Development

```bash
$ yarn dev
``` 

### Chroma DB
Chroma DB uses python which requires a binary to be built. 

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
  --distpath dist/linux \
  $(pip list --format=freeze | cut -d= -f1 | xargs -I{} echo "--collect-submodules {}") \
  server.py
```

#### Windows

Windows operates slightly differently. We recommend that you use [conda]() for a hassle-free build experience.

```sh
conda create -n vectordb-build python=3.1 -y
conda activate vectordb-build
pip install -r requirements.txt
pip install pyinstaller

$certPath = (python -c "import certifi; print(certifi.where())").Trim()
$pyiArgs = @("--onefile", "--name", "server", "--add-data", "$certPath;certifi")
pip list --format=freeze | ForEach-Object { $_.Split('=')[0] } | ForEach-Object { $pyiArgs += "--collect-all"; $pyiArgs += $_ }
$pyiArgs += "server.py"
& pyinstaller @pyiArgs
```

Move the file to `vectordb/dist/win` for windows, `vectordb/dist/linux`, and so on

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