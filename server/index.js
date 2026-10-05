import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { getGameDetails } from './details.js'
import { launchGame } from './launch.js'
import { collectLibrary } from './library.js'
import { resolvePrismIconPath } from './prism.js'
import { resolveSteamLibraryAssetPath } from './steam.js'

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile()

const PORT = Number(process.env.PORT || 8787)
const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/library', async (_req, res) => {
  try {
    const library = await collectLibrary()
    res.json(library)
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load library' })
  }
})

app.get('/api/games/:id/details', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id)
    const details = await getGameDetails(id)
    if (!details) {
      res.status(404).json({ error: 'Game not found' })
      return
    }
    res.json(details)
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load shop details' })
  }
})

app.get('/api/assets/prism/:instanceId/icon', (req, res) => {
  try {
    const instanceId = decodeURIComponent(req.params.instanceId)
    const iconPath = resolvePrismIconPath(instanceId)
    if (!iconPath || !fs.existsSync(iconPath)) {
      res.status(404).end()
      return
    }
    res.sendFile(iconPath)
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load icon' })
  }
})

app.get('/api/assets/steam/:appId/:file', (req, res) => {
  try {
    const appId = decodeURIComponent(req.params.appId)
    const file = path.basename(decodeURIComponent(req.params.file))
    if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
      res.status(400).json({ error: 'Invalid asset name' })
      return
    }
    const assetPath = resolveSteamLibraryAssetPath(appId, file)
    if (!assetPath || !fs.existsSync(assetPath)) {
      res.status(404).end()
      return
    }
    res.sendFile(path.basename(assetPath), {
      root: path.dirname(assetPath),
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load Steam asset' })
  }
})

app.post('/api/launch', async (req, res) => {
  try {
    const { id, action = 'launch' } = req.body || {}
    if (!id) {
      res.status(400).json({ error: 'Missing game id' })
      return
    }

    const { games } = await collectLibrary()
    const game = games.find((entry) => entry.id === id)
    if (!game) {
      res.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.source === 'demo') {
      res.json({
        ok: true,
        method: 'demo',
        message:
          action === 'uninstall'
            ? `Simulated uninstall for ${game.title}`
            : action === 'install'
              ? `Simulated install for ${game.title}`
              : `Simulated launch for ${game.title}`,
      })
      return
    }

    if (action === 'launch' && !game.canLaunch) {
      res.status(400).json({ error: 'Game is not installed' })
      return
    }

    if (action === 'install' && !game.canInstall) {
      res.status(400).json({ error: 'Game is already installed' })
      return
    }

    if (action === 'uninstall' && !game.canUninstall) {
      res.status(400).json({ error: 'Uninstall is not available for this game' })
      return
    }

    const result = launchGame(game, action)
    const installHint =
      result?.logFile
        ? `Starting install for ${game.title} (log: ${result.logFile})`
        : `Starting install for ${game.title}`
    const uninstallHint =
      result?.logFile
        ? `Starting uninstall for ${game.title} (log: ${result.logFile})`
        : `Starting uninstall for ${game.title}`
    res.json({
      ok: true,
      message:
        action === 'uninstall'
          ? game.store === 'steam'
            ? `Opening Steam uninstall for ${game.title}`
            : uninstallHint
          : action === 'install'
            ? game.store === 'steam'
              ? `Opening installer for ${game.title}`
              : installHint
            : `Launching ${game.title}`,
      ...result,
    })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Launch failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Kanapa Game Launcher bridge listening on http://localhost:${PORT}`)
})
