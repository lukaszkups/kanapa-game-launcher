const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const BRIDGE_PORT = Number(process.env.PORT || 8787)
const DEV_URL = process.env.KANAPA_DEV_URL || 'http://localhost:5173'
const PROD_URL = `http://127.0.0.1:${BRIDGE_PORT}`
const isDev = process.env.KANAPA_DESKTOP_DEV === '1'

let mainWindow = null
let bridgeProcess = null
let stopping = false

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1c2029',
    autoHideMenuBar: true,
    title: 'Kanapa Game Launcher',
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
}

async function boot() {
  await startBridge()
  if (isDev) {
    await waitForUrl(DEV_URL)
  } else {
    await waitForUrl(`http://127.0.0.1:${BRIDGE_PORT}/`)
  }
  createWindow()
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
  if (bridgeProcess && !bridgeProcess.killed) {
    bridgeProcess.kill()
  }
})
