import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { getHeroicGames } from './heroic.js'
import { launchGame } from './launch.js'
import { getInstalledSteamGames, getOwnedSteamGames } from './steam.js'

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

const DEMO_GAMES = [
  {
    id: 'demo:hadal',
    appId: 'hadal',
    title: 'Hadal Station',
    store: 'demo',
    runner: 'demo',
    installed: true,
    cover: '',
    hero: '',
    header: '',
    developer: 'Gamepad Library',
    description:
      'Demo entry used when no Steam or Heroic libraries are detected. Launch is simulated.',
    playtimeForever: 120,
    lastPlayed: null,
    launchTarget: 'hadal',
    canInstall: false,
    canLaunch: true,
    source: 'demo',
  },
  {
    id: 'demo:orbit',
    appId: 'orbit',
    title: 'Orbit Courier',
    store: 'demo',
    runner: 'demo',
    installed: false,
    cover: '',
    hero: '',
    header: '',
    developer: 'Gamepad Library',
    description: 'Another demo title so you can try filters and gamepad navigation.',
    playtimeForever: 0,
    lastPlayed: null,
    launchTarget: 'orbit',
    canInstall: true,
    canLaunch: false,
    source: 'demo',
  },
]

async function collectLibrary() {
  const steamInstalled = getInstalledSteamGames()
  let steamOwned = { games: [], configured: false, error: null }

  try {
    steamOwned = await getOwnedSteamGames()
  } catch (error) {
    steamOwned = { games: [], configured: true, error: error.message }
  }

  const heroic = getHeroicGames()
  const steamGames = steamOwned.configured ? steamOwned.games : steamInstalled.games
  const games = [...steamGames, ...heroic.games].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1
    return a.title.localeCompare(b.title)
  })

  if (!games.length) {
    return {
      games: DEMO_GAMES,
      sources: {
        steam: {
          mode: 'demo',
          installedCount: 0,
          ownedConfigured: steamOwned.configured,
          error: steamOwned.error,
        },
        heroic: { available: heroic.available, count: 0 },
        demo: true,
      },
    }
  }

  return {
    games,
    sources: {
      steam: {
        mode: steamOwned.configured ? 'api+local' : 'local-installed',
        installedCount: steamInstalled.games.length,
        ownedConfigured: steamOwned.configured,
        error: steamOwned.error,
        roots: steamInstalled.roots,
      },
      heroic: {
        available: heroic.available,
        count: heroic.games.length,
        root: heroic.root,
      },
      demo: false,
    },
  }
}

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
          action === 'install'
            ? `Simulated install for ${game.title}`
            : `Simulated launch for ${game.title}`,
      })
      return
    }

    if (action === 'launch' && !game.canLaunch) {
      res.status(400).json({ error: 'Game is not installed' })
      return
    }

    const result = launchGame(game, action)
    res.json({
      ok: true,
      message:
        action === 'install'
          ? `Opening installer for ${game.title}`
          : `Launching ${game.title}`,
      ...result,
    })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Launch failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Gamepad Library bridge listening on http://localhost:${PORT}`)
})
