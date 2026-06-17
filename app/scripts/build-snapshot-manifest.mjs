#!/usr/bin/env node
/**
 * build-snapshot-manifest.mjs — regenerate src/main/snapshot-manifest.json
 *
 * The catalog snapshot .gz (~14 GB) is too large to pin to Pinata as one object,
 * so it's uploaded in parts (`pinata upload-split`), each part pinned separately
 * and named `<prefix>.partNNN`. A public IPFS gateway can only fetch by CID, and
 * mapping those part NAMES to their CIDs needs Pinata's authenticated API — which
 * the shipped app must NOT carry. So we resolve name->CID ONCE, here, and commit
 * the resulting CID list. At runtime the app just reads that list and streams the
 * parts back-to-back from the gateway (see loadManifest/downloadGz in index.ts).
 *
 * Usage:
 *   PINATA_JWT=... node scripts/build-snapshot-manifest.mjs <name-prefix>
 *   # or put PINATA_JWT in app/.env (loaded automatically)
 *
 * The JWT must belong to the account that holds the parts. Writes the manifest
 * to src/main/snapshot-manifest.json next to index.ts.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const prefix = process.argv[2]
if (!prefix) {
  console.error('Usage: node scripts/build-snapshot-manifest.mjs <name-prefix>')
  process.exit(1)
}
const jwt = process.env.PINATA_JWT
if (!jwt) {
  console.error('Error: PINATA_JWT not set (export it or add it to app/.env).')
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '..', 'src', 'main', 'snapshot-manifest.json')

// Page through every file whose name starts with `prefix`.
async function* listAll(namePrefix) {
  let token
  for (;;) {
    const url = new URL('https://api.pinata.cloud/v3/files/public')
    url.searchParams.set('name', namePrefix)
    url.searchParams.set('limit', '100')
    if (token) url.searchParams.set('pageToken', token)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } })
    if (!res.ok) throw new Error(`Pinata list failed: ${res.status} ${await res.text()}`)
    const { data } = await res.json()
    for (const f of data?.files ?? []) yield f
    if (!data?.next_page_token) break
    token = data.next_page_token
  }
}

// Parse the `.partNNN` suffix. The zero-pad WIDTH matters: one prefix can collect
// parts from more than one upload run (e.g. an aborted run that padded
// differently), so we key by width and keep only the complete contiguous set.
function parsePart(name) {
  const m = /\.part(\d+)$/.exec(name ?? '')
  return m ? { index: parseInt(m[1], 10), width: m[1].length } : null
}
function isComplete(arr) {
  const seen = new Set(arr.map((p) => p.index))
  if (seen.size !== arr.length) return false
  for (let i = 0; i < arr.length; i++) if (!seen.has(i)) return false
  return true
}

const byWidth = new Map()
let scanned = 0
for await (const f of listAll(prefix)) {
  const p = parsePart(f.name)
  if (!p) continue
  if (!byWidth.has(p.width)) byWidth.set(p.width, [])
  byWidth.get(p.width).push({ index: p.index, name: f.name, id: f.id, cid: f.cid, size: f.size })
  process.stdout.write(`\r  scanned ${++scanned} part object(s)`)
}
process.stdout.write('\n')

if (byWidth.size > 1) {
  console.log(`Note: parts span ${byWidth.size} padding widths (overlapping upload runs):`)
  for (const [w, arr] of byWidth) {
    console.log(`   width ${w}: ${arr.length} part(s)${isComplete(arr) ? ' (complete)' : ' (incomplete — ignored)'}`)
  }
}
const complete = [...byWidth.values()].filter(isComplete)
if (!complete.length) {
  console.error('❌ No complete contiguous part set (0..n-1) found for this prefix.')
  process.exit(1)
}
// Prefer the largest complete set (the real full upload, not a short aborted one).
complete.sort((a, b) => b.length - a.length)
const parts = complete[0].slice().sort((a, b) => a.index - b.index)

const missing = parts.filter((p) => !p.cid)
if (missing.length) {
  console.error(`❌ ${missing.length} part(s) have no cid — aborting.`)
  process.exit(1)
}

const manifest = {
  name: prefix,
  total_size: parts.reduce((s, p) => s + (p.size || 0), 0),
  part_size: parts.reduce((m, p) => Math.max(m, p.size || 0), 0),
  parts,
  rebuilt: new Date().toISOString(),
}
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`✅ Wrote ${parts.length} part(s) → ${path.relative(process.cwd(), outPath)}`)
console.log(`   total_size = ${(manifest.total_size / 1024 ** 3).toFixed(2)} GB`)
console.log('   Remember to update sha256 in resolveSnapshot() if the catalog changed.')
