import { execFileSync } from 'node:child_process'

function which(command) {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function canManageWindows() {
  return Boolean(which('wmctrl') && which('xprop'))
}

export function getActiveWindowId() {
  if (!canManageWindows()) return null

  try {
    const output = execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], {
      encoding: 'utf8',
    })
    const match = output.match(/window id # (0x[0-9a-fA-F]+)/)
    if (!match) return null
    const id = match[1]
    if (id === '0x0') return null
    return id
  } catch {
    return null
  }
}

export function focusWindow(windowId) {
  if (!windowId || !which('wmctrl')) return false

  try {
    execFileSync('wmctrl', ['-ia', windowId], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function fullscreenWindow(windowId) {
  if (!windowId || !which('wmctrl')) return false

  try {
    execFileSync('wmctrl', ['-ir', windowId, '-b', 'add,fullscreen'], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

export function restoreLauncherWindow(windowId) {
  const focused = focusWindow(windowId)
  const fullscreen = fullscreenWindow(windowId)
  return focused || fullscreen
}
