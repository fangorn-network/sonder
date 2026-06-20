#!/usr/bin/env node
// `yarn clean` — wipe the app's persisted state so the next `yarn dev` behaves
// like a first-ever launch: re-downloads + recovers the Qdrant catalog snapshot,
// rebuilds the warmup indexes, starts with an empty local DB, and a fresh login.
//
// This removes only Electron's userData directory (per-OS app-data location).
// Dev build assets — the Qdrant engine binary, yt-dlp, the Python venv, .env —
// live in resources/ and vectordb/ and are provisioned by setup.mjs, NOT here,
// so a clean stays fast and doesn't re-download the toolchain.
//
// Close the app (and its Qdrant/python sidecars) before running this.
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
// Electron names userData after app.getName(), which defaults to package.json name.
const appName = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')).name

if (!appName) {
  console.error('✗ could not read "name" from package.json — refusing to guess the userData path.')
  process.exit(1)
}

function userDataDir(name) {
  const home = homedir()
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), name)
    case 'darwin':
      return join(home, 'Library', 'Application Support', name)
    default:
      return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), name)
  }
}

const dir = userDataDir(appName)

if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true })
  console.log(`✓ removed app state → ${dir}`)
  console.log(
    '  next `yarn dev` runs the first-launch flow: snapshot download + warmup, empty local DB, fresh login.'
  )
} else {
  console.log(`• nothing to clean — no app state at ${dir}`)
}
