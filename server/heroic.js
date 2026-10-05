import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function heroicRoot() {
  return path.join(os.homedir(), '.config', 'heroic')
}

function which(command) {
  try {
    return spawnSync('which', [command], { encoding: 'utf8' }).stdout.trim() || null
  } catch {
    return null
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function installedAppNames(root) {
  const names = new Set()

  const legendaryInstalled = readJson(
    path.join(root, 'legendaryConfig', 'legendary', 'installed.json'),
    {},
  )
  for (const appName of Object.keys(legendaryInstalled || {})) {
    names.add(`legendary:${appName}`)
  }

  const gogInstalled = readJson(path.join(root, 'gog_store', 'installed.json'), {
    installed: [],
  })
  for (const item of gogInstalled.installed || []) {
    if (item?.appName) names.add(`gog:${item.appName}`)
  }

  const nileInstalled = readJson(path.join(root, 'nile_config', 'installed.json'), {
    installed: [],
  })
  for (const item of nileInstalled.installed || []) {
    const appName = item?.appName || item?.id
    if (appName) names.add(`nile:${appName}`)
  }

  return names
}

function normalizeHeroicGame(game, store, installedNames) {
  const appName = String(game.app_name || game.appName || '')
  if (!appName || appName === 'gog-redist') return null

  const install = game.install || {}
  if (install.is_dlc) return null

  const runner = game.runner || store
  const key = `${runner}:${appName}`
  const installed =
    Boolean(game.is_installed) ||
    Boolean(install.install_path) ||
    installedNames.has(key)

  const description =
    game.extra?.about?.description ||
    game.extra?.about?.shortDescription ||
    game.description ||
    `${store.toUpperCase()} game managed by Heroic.`

  return {
    id: `${store}:${appName}`,
    appId: appName,
    title: game.title || game.app_title || appName,
    store,
    runner,
    installed,
    cover: game.art_square || game.art_cover || '',
    hero: game.art_cover || game.art_square || '',
    header: game.art_cover || game.art_square || '',
    developer: game.developer || '',
    description,
    playtimeForever: 0,
    lastPlayed: null,
    launchTarget: appName,
    canInstall: !installed,
    canLaunch: installed,
    canUninstall: installed && (store === 'epic' || store === 'gog'),
    source: 'heroic',
  }
}

function readLibraryList(filePath, listKey = 'library') {
  const data = readJson(filePath, null)
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data[listKey])) return data[listKey]
  if (Array.isArray(data.games)) return data.games
  return []
}

export function getHeroicGames() {
  const root = heroicRoot()
  if (!fs.existsSync(root)) {
    return { games: [], available: false, root }
  }

  const installedNames = installedAppNames(root)
  const collections = [
    {
      store: 'epic',
      file: path.join(root, 'store_cache', 'legendary_library.json'),
      key: 'library',
      defaultRunner: 'legendary',
    },
    {
      store: 'gog',
      file: path.join(root, 'store_cache', 'gog_library.json'),
      key: 'games',
      defaultRunner: 'gog',
    },
    {
      store: 'amazon',
      file: path.join(root, 'store_cache', 'nile_library.json'),
      key: 'library',
      defaultRunner: 'nile',
    },
  ]

  const games = []
  const seen = new Set()

  for (const collection of collections) {
    const list = readLibraryList(collection.file, collection.key)
    for (const entry of list) {
      const withRunner = {
        ...entry,
        runner: entry.runner || collection.defaultRunner,
      }
      const game = normalizeHeroicGame(withRunner, collection.store, installedNames)
      if (!game || seen.has(game.id)) continue
      seen.add(game.id)
      games.push(game)
    }
  }

  games.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1
    return a.title.localeCompare(b.title)
  })

  return { games, available: true, root }
}

export function findHeroicAppImage() {
  const applications = path.join(os.homedir(), 'Applications')
  if (!fs.existsSync(applications)) return null
  const match = fs
    .readdirSync(applications)
    .find((name) => /^Heroic-.*\.AppImage$/i.test(name))
  return match ? path.join(applications, match) : null
}

export function getHeroicDefaultInstallPath() {
  const config = readJson(path.join(heroicRoot(), 'config.json'), {})
  const settings = config.defaultSettings || config.settings || config
  return (
    settings.defaultInstallPath ||
    path.join(os.homedir(), 'Games/Heroic')
  )
}

function findMountedHeroicBinary(binName) {
  try {
    for (const name of fs.readdirSync('/tmp')) {
      if (!name.startsWith('.mount_Heroic')) continue
      const candidate = path.join(
        '/tmp',
        name,
        'resources/app.asar.unpacked/build/bin/x64/linux',
        binName,
      )
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {
    // ignore
  }
  return null
}

function mountHeroicAndFindBinary(binName) {
  const appImage = findHeroicAppImage()
  if (!appImage) return null

  const child = spawn(appImage, ['--appimage-mount'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  const started = Date.now()
  let mountPath = ''
  child.stdout.on('data', (chunk) => {
    if (!mountPath) {
      mountPath = String(chunk).split('\n')[0].trim()
    }
  })

  while (Date.now() - started < 8000) {
    spawnSync('sleep', ['0.1'])
    const fromMounts = findMountedHeroicBinary(binName)
    if (fromMounts) {
      child.kill()
      return fromMounts
    }
    if (mountPath) {
      const candidate = path.join(
        mountPath,
        'resources/app.asar.unpacked/build/bin/x64/linux',
        binName,
      )
      if (fs.existsSync(candidate)) {
        child.kill()
        return candidate
      }
    }
  }

  child.kill()
  return null
}

export function ensureHeroicRunnerBinary(binName) {
  const cacheDir = path.join(os.homedir(), '.cache/kanapa-game-library/heroic-bin')
  const cached = path.join(cacheDir, binName)
  if (fs.existsSync(cached)) return cached

  const source = findMountedHeroicBinary(binName) || mountHeroicAndFindBinary(binName)
  if (!source) return null

  fs.mkdirSync(cacheDir, { recursive: true })
  fs.copyFileSync(source, cached)
  fs.chmodSync(cached, 0o755)
  return cached
}

function doneFileForLog(logFile) {
  return `${logFile}.done`
}

function openProgressTerminal(logFile, title) {
  const logJson = JSON.stringify(logFile)
  const doneJson = JSON.stringify(doneFileForLog(logFile))
  const label = String(title || 'Working')
  const titleJson = JSON.stringify(label)
  const windowTitle = `Kanapa · ${label}`.slice(0, 80)
  const windowTitleJson = JSON.stringify(windowTitle)

  // Follow the log until Node drops a ".done" marker, then close.
  // (Watching the Legendary PID is unreliable — it can fork/exit early.)
  const script = [
    `printf '\\033]0;%s\\007' ${windowTitleJson}`,
    `echo ${titleJson}`,
    `echo ${JSON.stringify(`Log: ${logFile}`)}`,
    `echo`,
    `tail -n +1 -f ${logJson} &`,
    `TAILPID=$!`,
    `START=$(date +%s)`,
    `while [ ! -f ${doneJson} ]; do sleep 0.4; done`,
    `sleep 0.3`,
    `kill "$TAILPID" 2>/dev/null`,
    `wait "$TAILPID" 2>/dev/null`,
    `echo`,
    `echo ${JSON.stringify('Finished. Closing…')}`,
    // Keep the window visible briefly even if the job finished instantly.
    `ELAPSED=$(( $(date +%s) - START ))`,
    `if [ "$ELAPSED" -lt 2 ]; then sleep $(( 2 - ELAPSED )); fi`,
    `sleep 1`,
    `wmctrl -c ${windowTitleJson} 2>/dev/null || true`,
    `[ -n "$WINDOWID" ] && wmctrl -i -c "$WINDOWID" 2>/dev/null || true`,
    `exit 0`,
  ].join('; ')

  const candidates = [
    ['gnome-terminal', ['--title', windowTitle, '--', 'bash', '-lc', script]],
    ['konsole', ['-p', `tabtitle=${windowTitle}`, '-e', 'bash', '-lc', script]],
    ['x-terminal-emulator', ['-e', 'bash', '-lc', script]],
  ]

  for (const [command, args] of candidates) {
    if (!which(command)) continue
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      })
      child.unref()
      return { command, args }
    } catch {
      // try next
    }
  }
  return null
}

function markLogDone(logFile, code = 0) {
  try {
    fs.writeFileSync(doneFileForLog(logFile), String(code ?? 0))
  } catch {
    // ignore
  }
}

function processAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function legendaryStillRunning(appName, action = 'install') {
  try {
    const result = spawnSync(
      'pgrep',
      ['-f', `legendary.*${action}.*${appName}`],
      { encoding: 'utf8' },
    )
    return result.status === 0
  } catch {
    return false
  }
}

function watchLoggedProcessUntilDone(child, logFile, { appName = '', action = 'install' } = {}) {
  try {
    fs.unlinkSync(doneFileForLog(logFile))
  } catch {
    // ignore
  }

  const finishedRe =
    /Finished installation process|Installation finished|\[cli\] INFO: Finished|Successfully uninstalled|Game has been uninstalled|Removed GOG install/i

  let settled = false
  const settle = (code = 0) => {
    if (settled) return
    settled = true
    clearInterval(timer)
    // Let final log lines flush before the terminal stops following.
    setTimeout(() => markLogDone(logFile, code), 400)
  }

  const timer = setInterval(() => {
    const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
    if (finishedRe.test(logText)) {
      settle(0)
      return
    }

    const childGone = child.exitCode !== null || child.killed || !processAlive(child.pid)
    if (!childGone) return

    // Legendary may leave worker processes after the parent exits; keep waiting.
    if (appName && legendaryStillRunning(appName, action)) return

    settle(child.exitCode ?? 0)
  }, 800)

  child.on('exit', () => {
    // Exit alone is not enough — interval confirms no leftover workers / log done.
  })
}

function startDetachedLoggedProcess(command, args, env, logFile, watch = {}) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  fs.writeFileSync(logFile, '')
  try {
    fs.unlinkSync(doneFileForLog(logFile))
  } catch {
    // ignore
  }

  const out = fs.openSync(logFile, 'a')
  const err = fs.openSync(logFile, 'a')
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, ...env },
  })
  // Child has duplicated the fds; safe to close parent handles.
  fs.closeSync(out)
  fs.closeSync(err)

  // Give Legendary a moment to fail fast (auth/config/perms) before we
  // report success to the UI. Keep the process handle until then.
  const started = Date.now()
  while (Date.now() - started < 1200) {
    const alive = child.exitCode === null && !child.killed
    if (!alive) break
    spawnSync('sleep', ['0.1'])
  }

  const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
  const fatal =
    /PermissionError|Traceback \(most recent call last\)|Login failed|No saved credentials|ERROR:/.test(
      logText,
    )
  if (child.exitCode !== null && child.exitCode !== 0) {
    markLogDone(logFile, child.exitCode)
    throw new Error(
      `Install process exited early (code ${child.exitCode}). See ${logFile}`,
    )
  }
  if (fatal && child.exitCode !== null) {
    markLogDone(logFile, child.exitCode)
    throw new Error(`Install failed. See ${logFile}`)
  }

  watchLoggedProcessUntilDone(child, logFile, watch)
  child.unref()
  return child.pid
}

export function installHeroicGame(game) {
  const runner = game.runner || (game.store === 'epic' ? 'legendary' : game.store)
  const appName = String(game.launchTarget || game.appId || '')
  if (!appName) throw new Error('Missing Heroic app id')

  const installPath = getHeroicDefaultInstallPath()
  fs.mkdirSync(installPath, { recursive: true })
  const safeName = appName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
  const logFile = path.join(os.tmpdir(), `kanapa-install-${safeName}.log`)

  if (runner === 'legendary' || game.store === 'epic') {
    const legendary = ensureHeroicRunnerBinary('legendary')
    if (!legendary) {
      throw new Error('Could not find Legendary binary from Heroic AppImage')
    }
    const configPath = path.join(heroicRoot(), 'legendaryConfig', 'legendary')
    const args = [
      '-y',
      'install',
      appName,
      '--platform',
      'Windows',
      '--base-path',
      installPath,
    ]
    const pid = startDetachedLoggedProcess(
      legendary,
      args,
      {
        LEGENDARY_CONFIG_PATH: configPath,
        // Keep Legendary's vendored cache under the user home, not root.
        XDG_CACHE_HOME: path.join(os.homedir(), '.cache'),
      },
      logFile,
      { appName, action: 'install' },
    )
    const terminal = openProgressTerminal(
      logFile,
      `Installing ${game.title || appName}`,
    )
    console.log(
      `[install] legendary ${appName} pid=${pid} log=${logFile} terminal=${terminal?.command || 'none'}`,
    )

    return {
      ok: true,
      method: 'legendary-cli',
      runner: 'legendary',
      installPath,
      logFile,
      pid,
      terminal: terminal?.command || null,
    }
  }

  if (runner === 'gog' || game.store === 'gog') {
    const gogdl = ensureHeroicRunnerBinary('gogdl')
    if (!gogdl) {
      throw new Error('Could not find gogdl binary from Heroic AppImage')
    }
    const authPath = path.join(heroicRoot(), 'gog_store', 'auth.json')
    const gameDir = path.join(installPath, appName)
    const args = [
      '--auth-config-path',
      authPath,
      'download',
      appName,
      '--path',
      gameDir,
      '--platform',
      'windows',
      '--with-dlcs',
    ]
    const pid = startDetachedLoggedProcess(
      gogdl,
      args,
      {},
      logFile,
      { appName, action: 'download' },
    )
    const terminal = openProgressTerminal(
      logFile,
      `Installing ${game.title || appName}`,
    )
    console.log(
      `[install] gogdl ${appName} pid=${pid} log=${logFile} terminal=${terminal?.command || 'none'}`,
    )

    return {
      ok: true,
      method: 'gogdl-cli',
      runner: 'gog',
      installPath: gameDir,
      logFile,
      pid,
      terminal: terminal?.command || null,
    }
  }

  return null
}

function legendaryEnv() {
  return {
    LEGENDARY_CONFIG_PATH: path.join(heroicRoot(), 'legendaryConfig', 'legendary'),
    XDG_CACHE_HOME: path.join(os.homedir(), '.cache'),
  }
}

export function uninstallHeroicGame(game) {
  const runner = game.runner || (game.store === 'epic' ? 'legendary' : game.store)
  const appName = String(game.launchTarget || game.appId || '')
  if (!appName) throw new Error('Missing Heroic app id')

  const safeName = appName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
  const logFile = path.join(os.tmpdir(), `kanapa-uninstall-${safeName}.log`)

  if (runner === 'legendary' || game.store === 'epic') {
    const legendary = ensureHeroicRunnerBinary('legendary')
    if (!legendary) {
      throw new Error('Could not find Legendary binary from Heroic AppImage')
    }
    const pid = startDetachedLoggedProcess(
      legendary,
      ['-y', 'uninstall', appName],
      legendaryEnv(),
      logFile,
      { appName, action: 'uninstall' },
    )
    const terminal = openProgressTerminal(
      logFile,
      `Uninstalling ${game.title || appName}`,
    )
    console.log(
      `[uninstall] legendary ${appName} pid=${pid} log=${logFile} terminal=${terminal?.command || 'none'}`,
    )
    return {
      ok: true,
      method: 'legendary-cli',
      runner: 'legendary',
      logFile,
      pid,
      terminal: terminal?.command || null,
    }
  }

  if (runner === 'gog' || game.store === 'gog') {
    const root = heroicRoot()
    const installedPath = path.join(root, 'gog_store', 'installed.json')
    const data = readJson(installedPath, { installed: [] })
    const list = Array.isArray(data.installed) ? data.installed : []
    const match = list.find((item) => item?.appName === appName)
    const installDir = match?.install_path || null

    if (installDir && fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true })
    }

    const next = {
      ...data,
      installed: list.filter((item) => item?.appName !== appName),
    }
    fs.writeFileSync(installedPath, JSON.stringify(next, null, 2))
    fs.writeFileSync(
      logFile,
      `Removed GOG install for ${appName}${installDir ? ` (${installDir})` : ''}\n`,
    )

    console.log(`[uninstall] gog ${appName} path=${installDir || 'none'}`)
    return {
      ok: true,
      method: 'gog-local',
      runner: 'gog',
      installPath: installDir,
      logFile,
    }
  }

  throw new Error(`Uninstall is not supported for ${runner}`)
}
