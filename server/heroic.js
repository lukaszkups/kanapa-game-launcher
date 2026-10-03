import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function heroicRoot() {
  return path.join(os.homedir(), '.config', 'heroic')
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
