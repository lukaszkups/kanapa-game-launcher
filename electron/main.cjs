const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const BRIDGE_PORT = Number(process.env.PORT || 8787)
const DEV_URL = process.env.KANAPA_DEV_URL || 'http://localhost:5173'
const PROD_URL = `http://127.0.0.1:${BRIDGE_PORT}`
const isDev = process.env.KANAPA_DESKTOP_DEV === '1'
const SETTINGS_PATH = path.join(
  os.homedir(),
  '.config',
  'kanapa-game-library',
  'settings.json',
)
const LINUX_AUTOSTART_PATH = path.join(
  os.homedir(),
  '.config',
  'autostart',
  'kanapa-game-library.desktop',
)

let mainWindow = null
let bridgeProcess = null
let stopping = false
let keepOnTopEnabled = false
let gameRunning = false
let sessionPollTimer = 0
let settingsWatchTimer = 0

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function waitForUrl(url, { timeoutMs = 45000, intervalMs = 250 } = {}) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) {
          resolve()
          return
        }
        retry()
      })
      req.on('error', retry)
      req.setTimeout(1500, () => {
        req.destroy()
        retry()
      })
    }

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`))
        return
      }
      setTimeout(tick, intervalMs)
    }

    tick()
  })
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'))
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(2000, () => {
      req.destroy(new Error('timeout'))
    })
  })
}

function startBridge() {
  if (isDev) {
    // `npm run desktop:dev` already starts the bridge via concurrently.
    return Promise.resolve()
  }

  const entry = path.join(ROOT, 'server', 'index.js')
  bridgeProcess = spawn('node', [entry], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(BRIDGE_PORT),
      KANAPA_SERVE_STATIC: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  bridgeProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[bridge] ${chunk}`)
  })
  bridgeProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[bridge] ${chunk}`)
  })
  bridgeProcess.on('exit', (code) => {
    bridgeProcess = null
    if (!stopping && code) {
      console.error(`Bridge exited with code ${code}`)
    }
  })

  return waitForUrl(`http://127.0.0.1:${BRIDGE_PORT}/api/health`)
}

function applyAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const shouldPin = keepOnTopEnabled && !gameRunning
  mainWindow.setAlwaysOnTop(shouldPin, shouldPin ? 'floating' : 'normal')
  if (shouldPin && !mainWindow.isVisible()) {
    mainWindow.show()
  }
}

function setLinuxAutostart(enabled) {
  if (enabled) {
    fs.mkdirSync(path.dirname(LINUX_AUTOSTART_PATH), { recursive: true })
    const execPath = process.execPath
    const appPath = ROOT
    const desktop = [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=Kanapa Game Launcher',
      'Comment=Couch game library for Steam and Heroic',
      `Exec="${execPath}" "${appPath}"`,
      `Path=${appPath}`,
      'Terminal=false',
      'Categories=Game;',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n')
    fs.writeFileSync(LINUX_AUTOSTART_PATH, desktop)
    return
  }

  try {
    fs.unlinkSync(LINUX_AUTOSTART_PATH)
  } catch {
    // already removed
  }
}

function applyLaunchOnStartup(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: [ROOT],
    })
  } catch (error) {
    console.warn('setLoginItemSettings failed:', error.message || error)
  }

  if (process.platform === 'linux') {
    try {
      setLinuxAutostart(Boolean(enabled))
    } catch (error) {
      console.warn('Linux autostart update failed:', error.message || error)
    }
  }
}

function applyDesktopSettings(settings = {}) {
  keepOnTopEnabled = Boolean(settings.keepOnTop)
  applyAlwaysOnTop()
  applyLaunchOnStartup(Boolean(settings.launchOnStartup))
}

async function syncSettingsFromDiskOrApi() {
  let settings = readSettings()
  try {
    const remote = await fetchJson(`http://127.0.0.1:${BRIDGE_PORT}/api/settings`)
    settings = {
      ...settings,
      launchOnStartup: remote.launchOnStartup,
      keepOnTop: remote.keepOnTop,
    }
  } catch {
    // fall back to disk
  }
  applyDesktopSettings(settings)
}

async function pollSession() {
  try {
    const session = await fetchJson(`http://127.0.0.1:${BRIDGE_PORT}/api/session`)
    const next = Boolean(session.gameRunning)
    if (next !== gameRunning) {
      gameRunning = next
      applyAlwaysOnTop()
    }
  } catch {
    // bridge may be briefly unavailable
  }
}

function startWatchers() {
  syncSettingsFromDiskOrApi().catch(() => {})

  sessionPollTimer = setInterval(() => {
    pollSession().catch(() => {})
  }, 1500)

  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
    fs.watch(path.dirname(SETTINGS_PATH), (_event, filename) => {
      if (filename && filename !== 'settings.json') return
      if (settingsWatchTimer) clearTimeout(settingsWatchTimer)
      settingsWatchTimer = setTimeout(() => {
        syncSettingsFromDiskOrApi().catch(() => {})
      }, 200)
    })
  } catch (error) {
    console.warn('Could not watch settings file:', error.message || error)
  }
}

function createWindow() {
  const settings = readSettings()
  keepOnTopEnabled = Boolean(settings.keepOnTop)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1c2029',
    autoHideMenuBar: true,
    title: 'Kanapa Game Launcher',
    alwaysOnTop: keepOnTopEnabled && !gameRunning,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadURL(isDev ? DEV_URL : PROD_URL)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  applyAlwaysOnTop()
}

async function boot() {
  await startBridge()
  if (isDev) {
    await waitForUrl(DEV_URL)
  } else {
    await waitForUrl(`http://127.0.0.1:${BRIDGE_PORT}/`)
  }
  createWindow()
  startWatchers()
}

app.whenReady().then(() => {
  boot().catch((error) => {
    console.error(error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopping = true
  if (sessionPollTimer) clearInterval(sessionPollTimer)
  if (settingsWatchTimer) clearTimeout(settingsWatchTimer)
  if (bridgeProcess && !bridgeProcess.killed) {
    bridgeProcess.kill()
  }
})
