import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolvePrismInstancePath } from './prism.js'
import { restoreLauncherWindow } from './window.js'

const START_TIMEOUT_MS = 120_000
const POLL_MS = 1_500
const SETTLE_MS = 1_500
const EXIT_GRACE_MS = 5_000

let activeWatcher = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function heroicRoot() {
  return path.join(os.homedir(), '.config', 'heroic')
}

function getHeroicInstallPath(game) {
  const root = heroicRoot()
  const appName = String(game.launchTarget || game.appId || '')
  if (!appName) return null

  const runner = game.runner || (game.store === 'epic' ? 'legendary' : game.store)

  if (runner === 'legendary' || game.store === 'epic') {
    const installed = readJson(
      path.join(root, 'legendaryConfig', 'legendary', 'installed.json'),
      {},
    )
    return installed?.[appName]?.install_path || null
  }

  if (runner === 'gog' || game.store === 'gog') {
    const data = readJson(path.join(root, 'gog_store', 'installed.json'), {
      installed: [],
    })
    const match = (data.installed || []).find((item) => item?.appName === appName)
    return match?.install_path || null
  }

  if (runner === 'nile' || game.store === 'amazon') {
    const data = readJson(path.join(root, 'nile_config', 'installed.json'), {
      installed: [],
    })
    const match = (data.installed || []).find(
      (item) => item?.appName === appName || item?.id === appName,
    )
    return match?.install_path || null
  }

  return null
}

function listPids() {
  try {
    return fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name))
  } catch {
    return []
  }
}

function envContains(pid, needle) {
  try {
    const env = fs.readFileSync(`/proc/${pid}/environ`)
    return env.includes(Buffer.from(needle))
  } catch {
    return false
  }
}

function pathTouchedByPid(pid, installPath) {
  const normalized = path.resolve(installPath)
  const prefix = normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`

  try {
    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`)
    if (cwd === normalized || cwd.startsWith(prefix)) return true
  } catch {
    // ignore
  }

  try {
    const exe = fs.readlinkSync(`/proc/${pid}/exe`)
    if (exe === normalized || exe.startsWith(prefix)) return true
  } catch {
    // ignore
  }

  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    if (cmdline.includes(normalized)) return true
  } catch {
    // ignore
  }

  return false
}

function prismInstancePath(game) {
  if (game.instancePath) return game.instancePath
  return resolvePrismInstancePath(String(game.launchTarget || game.appId || ''))
}

function isPrismRunning(game) {
  const instanceId = String(game.launchTarget || game.appId || '')
  const instancePath = prismInstancePath(game)
  if (!instanceId && !instancePath) return false

  return listPids().some((pid) => {
    try {
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (instanceId) {
        if (
          cmdline.includes('--launch') &&
          cmdline.includes(instanceId) &&
          /prism/i.test(cmdline)
        ) {
          return true
        }
      }
      if (instancePath && pathTouchedByPid(pid, instancePath)) return true
      // Minecraft/Java often has the instance path on the command line.
      if (instancePath && cmdline.includes(instancePath)) return true
    } catch {
      // ignore
    }
    return false
  })
}

export function isGameRunning(game) {
  if (!game) return false

  if (game.store === 'steam') {
    const appId = String(game.launchTarget || game.appId || '')
    if (!appId) return false
    const needles = [`SteamAppId=${appId}`, `SteamGameId=${appId}`]
    return listPids().some((pid) => needles.some((needle) => envContains(pid, needle)))
  }

  if (game.store === 'prism') {
    return isPrismRunning(game)
  }

  const installPath = getHeroicInstallPath(game)
  if (!installPath || !fs.existsSync(installPath)) return false
  return listPids().some((pid) => pathTouchedByPid(pid, installPath))
}

async function waitFor(predicate, { timeoutMs, pollMs = POLL_MS, isCancelled } = {}) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (isCancelled?.()) return false
    if (predicate()) return true
    await sleep(pollMs)
  }
  if (isCancelled?.()) return false
  return predicate()
}

export function watchGameAndRestoreFocus(game, windowId) {
  if (!windowId || !game) return

  if (activeWatcher?.cancel) activeWatcher.cancel()

  let cancelled = false
  const isCancelled = () => cancelled
  const watcher = {
    cancel() {
      cancelled = true
    },
  }
  activeWatcher = watcher

  ;(async () => {
    try {
      const started = await waitFor(() => isGameRunning(game), {
        timeoutMs: START_TIMEOUT_MS,
        isCancelled,
      })
      if (cancelled || !started) return

      while (!cancelled) {
        while (!cancelled && isGameRunning(game)) {
          await sleep(POLL_MS)
        }
        if (cancelled) return

        // Launchers can exit briefly before the real game process appears.
        const reappeared = await waitFor(() => isGameRunning(game), {
          timeoutMs: EXIT_GRACE_MS,
          isCancelled,
        })
        if (cancelled) return
        if (!reappeared) break
      }
      if (cancelled) return

      await sleep(SETTLE_MS)
      if (cancelled) return

      restoreLauncherWindow(windowId)
    } catch (error) {
      console.warn('Failed to restore focus after game exit:', error.message || error)
    } finally {
      if (activeWatcher === watcher) activeWatcher = null
    }
  })()
}
