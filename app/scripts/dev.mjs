// Dev launcher with a Linux-only sandbox fallback.
//
// On Ubuntu 24.04 and *-lowlatency kernels, AppArmor restricts unprivileged
// user namespaces (kernel.apparmor_restrict_unprivileged_userns=1). Electron's
// Chromium sandbox needs such a namespace to start; when it's blocked the
// sandboxed syscalls fail and Electron dies before DevTools attaches, with a
// misleading fatal error like:
//   FATAL:platform_shared_memory_region_posix.cc ... /dev/shm ... No such process (3)
//
// When we detect that restriction we disable the sandbox for `yarn dev` only.
// Production builds never run this script, so they keep the sandbox. On macOS,
// Windows, or a Linux box without the restriction, nothing changes.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const env = { ...process.env }

function unprivilegedUsernsBlocked() {
  if (process.platform !== 'linux') return false
  try {
    const flag = readFileSync(
      '/proc/sys/kernel/apparmor_restrict_unprivileged_userns',
      'utf8'
    ).trim()
    return flag === '1'
  } catch {
    return false
  }
}

if (unprivilegedUsernsBlocked() && !('ELECTRON_DISABLE_SANDBOX' in env)) {
  env.ELECTRON_DISABLE_SANDBOX = '1'
  console.log(
    '[dev] AppArmor restricts unprivileged user namespaces; disabling the ' +
      'Electron sandbox for dev (ELECTRON_DISABLE_SANDBOX=1). Set ' +
      'ELECTRON_DISABLE_SANDBOX explicitly to override.'
  )
}

const child = spawn('yarn', ['electron-vite', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
