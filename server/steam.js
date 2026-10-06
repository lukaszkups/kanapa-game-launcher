import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getSteamCredentials } from './settings.js'

const STEAM_TOOL_PATTERNS = [
  /^proton/i,
  /steamworks common/i,
  /steam linux runtime/i,
  /^steamworks/i,
]

function expandHome(filePath) {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1))
  }
  return filePath
}

function parseVdfObject(text) {
  const tokens = []
  const re = /"([^"\\]|\\.)*"|[{}]/g
  let match
  while ((match = re.exec(text))) {
    const raw = match[0]
    if (raw === '{' || raw === '}') {
      tokens.push(raw)
    } else {
      tokens.push(JSON.parse(raw))
    }
  }

  let index = 0
  function parseValue() {
    const token = tokens[index++]
    if (token === '{') {
      const obj = {}
      while (tokens[index] !== '}') {
        const key = tokens[index++]
        obj[key] = parseValue()
      }
      index++
      return obj
    }
    return token
  }

  if (!tokens.length) return {}
  if (tokens[0] !== '{') {
    const rootKey = tokens[index++]
    return { [rootKey]: parseValue() }
  }
  return parseValue()
}

function candidateSteamRoots() {
  const home = os.homedir()
  return [
    path.join(home, '.local/share/Steam'),
    path.join(home, '.steam/steam'),
    path.join(home, '.steam/root'),
    path.join(home, 'Steam'),
  ]
}

function findLibraryFoldersFile() {
  for (const root of candidateSteamRoots()) {
    const candidates = [
      path.join(root, 'steamapps', 'libraryfolders.vdf'),
      path.join(root, 'config', 'libraryfolders.vdf'),
    ]
    for (const file of candidates) {
      if (fs.existsSync(file)) return { root, file }
    }
  }
  return null
}

function libraryPathsFromVdf(vdfPath) {
  const parsed = parseVdfObject(fs.readFileSync(vdfPath, 'utf8'))
  const folders = parsed.libraryfolders || parsed.LibraryFolders || {}
  const paths = new Set()

  for (const value of Object.values(folders)) {
    if (typeof value === 'string') {
      paths.add(expandHome(value))
    } else if (value && typeof value === 'object' && value.path) {
      paths.add(expandHome(value.path))
    }
  }

  return [...paths]
}

function steamCdnAsset(appId, file) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`
}

export function resolveSteamLibraryAssetPath(appId, file) {
  const id = String(appId)
  const candidates = []
  for (const root of candidateSteamRoots()) {
    const cacheDir = path.join(root, 'appcache', 'librarycache')
    candidates.push(path.join(cacheDir, id, file))
    candidates.push(path.join(cacheDir, `${id}_${file}`))
    candidates.push(path.join(cacheDir, file))
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function steamAssetUrl(appId, file) {
  if (resolveSteamLibraryAssetPath(appId, file)) {
    return `/api/assets/steam/${encodeURIComponent(appId)}/${encodeURIComponent(file)}`
  }
  return steamCdnAsset(appId, file)
}

function steamCoverUrls(appId) {
  const preferred = ['library_600x900.jpg', 'portrait.png', 'header.jpg', 'capsule_616x353.jpg']
  const cover =
    preferred
      .map((file) => {
        if (resolveSteamLibraryAssetPath(appId, file)) {
          return `/api/assets/steam/${encodeURIComponent(appId)}/${encodeURIComponent(file)}`
        }
        return null
      })
      .find(Boolean) || steamCdnAsset(appId, 'library_600x900.jpg')

  const fallbacks = preferred
    .map((file) => steamCdnAsset(appId, file))
    .filter((url) => url !== cover)

  return { cover, coverFallbacks: fallbacks }
}

function normalizeSteamGame(fields) {
  const appId = String(fields.appId)
  const art = steamCoverUrls(appId)
  return {
    ...fields,
    cover: art.cover,
    coverFallbacks: art.coverFallbacks,
    hero: steamAssetUrl(appId, 'library_hero.jpg'),
    header: steamAssetUrl(appId, 'header.jpg'),
  }
}

function parseAppManifest(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const parsed = parseVdfObject(text)
  const state = parsed.AppState || parsed.appstate || {}
  const appId = String(state.appid || '')
  const name = state.name || 'Unknown Steam Game'
  if (!appId || STEAM_TOOL_PATTERNS.some((pattern) => pattern.test(name))) {
    return null
  }

  const stateFlags = Number(state.StateFlags || 0)
  const installed = (stateFlags & 4) === 4

  return normalizeSteamGame({
    id: `steam:${appId}`,
    appId,
    title: name,
    store: 'steam',
    runner: 'steam',
    installed,
    developer: '',
    description: installed
      ? 'Installed locally via Steam.'
      : 'Owned on Steam.',
    playtimeForever: Number(state.playtime_forever || 0),
    lastPlayed: Number(state.LastPlayed || 0) || null,
    launchTarget: appId,
    canInstall: !installed,
    canLaunch: installed,
    canUninstall: installed,
    source: 'steam-local',
  })
}

export function getInstalledSteamGames() {
  const found = findLibraryFoldersFile()
  if (!found) return { games: [], roots: [] }

  const roots = new Set(libraryPathsFromVdf(found.file))
  roots.add(found.root)

  const games = []
  const seen = new Set()

  for (const root of roots) {
    const steamapps = path.join(root, 'steamapps')
    if (!fs.existsSync(steamapps)) continue

    for (const entry of fs.readdirSync(steamapps)) {
      if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue
      const game = parseAppManifest(path.join(steamapps, entry))
      if (!game || seen.has(game.appId)) continue
      seen.add(game.appId)
      games.push(game)
    }
  }

  games.sort((a, b) => a.title.localeCompare(b.title))
  return { games, roots: [...roots] }
}

export async function getOwnedSteamGames() {
  const { apiKey, steamId } = getSteamCredentials()
  if (!apiKey || !steamId) {
    return { games: [], configured: false }
  }

  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('steamid', steamId)
  url.searchParams.set('include_appinfo', '1')
  url.searchParams.set('include_played_free_games', '1')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Steam API error: ${response.status}`)
  }

  const payload = await response.json()
  const owned = payload?.response?.games || []
  const { games: installed } = getInstalledSteamGames()
  const installedIds = new Set(installed.map((game) => game.appId))

  const games = owned
    .filter((game) => !STEAM_TOOL_PATTERNS.some((pattern) => pattern.test(game.name || '')))
    .map((game) => {
      const appId = String(game.appid)
      const isInstalled = installedIds.has(appId)
      return normalizeSteamGame({
        id: `steam:${appId}`,
        appId,
        title: game.name || `Steam ${appId}`,
        store: 'steam',
        runner: 'steam',
        installed: isInstalled,
        developer: '',
        description: isInstalled
          ? 'Installed locally via Steam.'
          : 'Owned on Steam. Press Install to open Steam.',
        playtimeForever: Number(game.playtime_forever || 0),
        lastPlayed: null,
        launchTarget: appId,
        canInstall: !isInstalled,
        canLaunch: isInstalled,
        canUninstall: isInstalled,
        source: 'steam-api',
      })
    })
    .sort((a, b) => a.title.localeCompare(b.title))

  return { games, configured: true }
}
