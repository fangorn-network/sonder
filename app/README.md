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

and paste:

``` 
VITE_ARBITRUM_SEPOLIA_RPC_URL=
VITE_USE_AGENT=true
VITE_GRAPH_API_KEY=
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_CLIENT_SECRET=
VITE_PINATA_GATEWAY=
```

You will need to fetch a spotify client/secret and an api key for the Graph.

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

#### Prerequisites

##### Qdrant

SOND3R runs a qdrant instance as a side car. To install the image, run the following:

Do not run this from root unless you change the name of the tmp dir (else do not delete it!)
``` sh
mkdir ~/fangorn/sonder/tmp
mkdir -p ~/fangorn/sonder/app/resources/qdrant
cd ~/fangorn/sonder/tmp
curl -L -o qdrant.tar.gz https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar xzf qdrant.tar.gz
mv qdrant ~/fangorn/sonder/app/resources/qdrant/qdrant
chmod +x ~/fangorn/sonder/app/resources/qdrant/qdrant
cd ~/fangorn/sonder && rm -rf ~/fangorn/sonder/tmp

# confirm it is available
~/fangorn/sonder/app/resources/qdrant/qdrant --version
```

##### Install Python deps

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

For releases, yoau must then build the binary
```bash
pyinstaller --onefile --name server \
  --distpath dist/linux \
  $(pip list --format=freeze | cut -d= -f1 | xargs -I{} echo "--collect-submodules {}") \
  server.py
```

#### Windows

Windows operates slightly differently. We recommend that you use [conda](https://docs.conda.io/projects/conda/en/stable/user-guide/install/windows.html) for a hassle-free build experience.

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
