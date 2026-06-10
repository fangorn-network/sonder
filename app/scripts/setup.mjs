#!/usr/bin/env node
// Dev onboarding: makes `yarn install && yarn dev` work on a fresh clone.
// Runs on `predev` (and `yarn setup`). Every step is idempotent — re-runs are
// cheap and self-healing. Never exits non-zero, so it can't block `yarn dev`;
// failures degrade gracefully and are summarized at the end.
//
// Skipped in CI: CI invokes `build:*`, not `dev`, so this predev hook never
// fires there (CI provisions Qdrant / the PyInstaller server in the workflow).
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const RES = join(APP, 'resources')

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const OS = isWin ? 'win' : isMac ? 'mac' : 'linux'
const EXE = isWin ? '.exe' : ''

// Keep this pinned in lockstep with QDRANT_VERSION in .github/workflows/build.yml
const QDRANT_VERSION = 'v1.18.2'
const QDRANT_ASSET = {
  linux: 'qdrant-x86_64-unknown-linux-gnu.tar.gz',
  mac: 'qdrant-aarch64-apple-darwin.tar.gz',
  win: 'qdrant-x86_64-pc-windows-msvc.zip',
}[OS]
const YTDLP_ASSET = { linux: 'yt-dlp', mac: 'yt-dlp_macos', win: 'yt-dlp.exe' }[OS]

const warnings = []
const step = (m) => console.log(`\n• ${m}`)
const ok = (m) => console.log(`  ✓ ${m}`)
const warn = (m) => {
  warnings.push(m)
  console.warn(`  ⚠ ${m}`)
}

async function download(url, dest) {
  const res = await fetch(url) // fetch follows redirects (GitHub → CDN) by default
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`\`${cmd} ${args.join(' ')}\` exited ${r.status}`)
}
const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0

function setupEnv() {
  step('.env')
  const env = join(APP, '.env')
  const example = join(APP, '.env.example')
  if (existsSync(env)) return ok('.env already exists')
  if (!existsSync(example)) return warn('.env.example missing; skipping .env creation')
  copyFileSync(example, env)
  ok('created .env from .env.example — add real values for auth/Firebase/Spotify')
}

async function setupYtDlp() {
  step('yt-dlp')
  const dir = join(RES, 'bin', OS)
  const bin = join(dir, `yt-dlp${EXE}`)
  if (existsSync(bin)) return ok(`already present (${OS})`)
  mkdirSync(dir, { recursive: true })
  await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`, bin)
  if (!isWin) chmodSync(bin, 0o755)
  ok(`downloaded → resources/bin/${OS}/yt-dlp${EXE}`)
}

async function setupQdrant() {
  step(`Qdrant engine (${QDRANT_VERSION})`)
  const dir = join(RES, 'qdrant', OS)
  const bin = join(dir, `qdrant${EXE}`)
  if (existsSync(bin)) return ok(`already present (${OS})`)
  mkdirSync(dir, { recursive: true })
  const archive = join(dir, QDRANT_ASSET)
  await download(
    `https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/${QDRANT_ASSET}`,
    archive
  )
  // bsdtar (mac/win) and GNU tar (linux) both handle their own archive here:
  // .tar.gz via -xzf; the Windows .zip via -xf (bsdtar auto-detects zip).
  run('tar', [QDRANT_ASSET.endsWith('.zip') ? '-xf' : '-xzf', archive, '-C', dir])
  rmSync(archive, { force: true })
  if (!existsSync(bin)) throw new Error(`archive did not contain ${`qdrant${EXE}`} at its root`)
  if (!isWin) chmodSync(bin, 0o755)
  ok(`downloaded → resources/qdrant/${OS}/qdrant${EXE}`)
}

function setupVenv() {
  step('Python backend (vectordb venv)')
  if (process.env.SKIP_PY_SETUP === '1') return ok('skipped (SKIP_PY_SETUP=1)')
  const vdb = join(APP, 'vectordb')
  const venv = join(vdb, 'venv')
  const pip = isWin ? join(venv, 'Scripts', 'pip.exe') : join(venv, 'bin', 'pip')
  // Stamp the requirements hash after a successful install so we re-install only
  // when requirements.txt drifts (or an existing venv was never fully synced) —
  // not on every `yarn dev`.
  const stamp = join(venv, '.requirements.sha256')
  const reqHash = createHash('sha256').update(readFileSync(join(vdb, 'requirements.txt'))).digest('hex')
  const venvExists = existsSync(pip)
  const synced = venvExists && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === reqHash
  if (synced) return ok('venv up to date')

  if (!venvExists) {
    const py = ['python3', 'python'].find((p) => has(p))
    if (!py) {
      return warn(
        'Python 3 not found on PATH — vector-search backend stays offline in dev. ' +
          'Install Python 3.12+, then run `yarn setup`.'
      )
    }
    console.log('  ↻ creating venv…')
    try {
      run(py, ['-m', 'venv', 'venv'], { cwd: vdb })
    } catch (e) {
      return warn(`venv creation failed: ${e.message} — fix Python, then run \`yarn setup\`.`)
    }
  }

  console.log(
    venvExists
      ? '  ↻ syncing requirements into existing venv…'
      : '  ↻ installing requirements (first run takes a few minutes)…'
  )
  try {
    run(pip, ['install', '--quiet', '--upgrade', 'pip'], { cwd: vdb })
    run(pip, ['install', '--quiet', '-r', 'requirements.txt'], { cwd: vdb })
    writeFileSync(stamp, reqHash)
    ok('venv ready')
  } catch (e) {
    warn(`requirements install failed: ${e.message} — run \`yarn setup\` after fixing.`)
  }
}

function checkFfmpeg() {
  step('ffmpeg (optional — audio extraction)')
  if (has('ffmpeg', ['-version'])) return ok('found')
  const hint = isMac
    ? 'brew install ffmpeg'
    : isWin
      ? 'winget install Gyan.FFmpeg   (or: choco install ffmpeg)'
      : 'sudo apt install ffmpeg   (Debian/Ubuntu)'
  warn(`ffmpeg not on PATH — install for audio features: ${hint}`)
}

async function main() {
  console.log(`sond3r dev setup — ${process.platform}/${process.arch} (${OS})`)
  for (const task of [setupEnv, setupYtDlp, setupQdrant, setupVenv, checkFfmpeg]) {
    try {
      await task()
    } catch (e) {
      warn(`${task.name} failed: ${e.message}`)
    }
  }
  console.log(
    warnings.length
      ? `\nSetup finished with ${warnings.length} warning(s) — see ⚠ above. ` +
          'The app still launches; affected features may be degraded.'
      : '\nSetup complete ✓  Run `yarn dev`.'
  )
  process.exit(0) // never block dev
}

main()
