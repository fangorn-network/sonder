#!/bin/bash
set -e

BIN="./node_modules/.bin"

echo "[build] hiding pnpm signals..."
mv pnpm-lock.yaml pnpm-lock.yaml.bak
mv node_modules/.pnpm node_modules/.pnpm.bak
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  delete pkg.packageManager;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

cleanup() {
  echo "[build] restoring pnpm signals..."
  mv pnpm-lock.yaml.bak pnpm-lock.yaml
  mv node_modules/.pnpm.bak node_modules/.pnpm
  git checkout package.json 2>/dev/null || true
}
trap cleanup EXIT

echo "[build] building..."
$BIN/electron-vite build && $BIN/electron-builder --win