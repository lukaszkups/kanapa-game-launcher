import { getHeroicGames } from './heroic.js'
import { getPrismGames } from './prism.js'
import { getInstalledSteamGames, getOwnedSteamGames } from './steam.js'

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
    developer: 'lukaszkups',
    description:
      'Demo entry used when no Steam or Heroic libraries are detected. Launch is simulated.',
    playtimeForever: 120,
    lastPlayed: null,
    launchTarget: 'hadal',
    canInstall: false,
    canLaunch: true,
    canUninstall: false,
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
    developer: 'lukaszkups',
    description: 'Another demo title so you can try filters and gamepad navigation.',
    playtimeForever: 0,
    lastPlayed: null,
    launchTarget: 'orbit',
    canInstall: true,
    canLaunch: false,
    canUninstall: false,
    source: 'demo',
  },
]

export async function collectLibrary() {
  const steamInstalled = getInstalledSteamGames()
  let steamOwned = { games: [], configured: false, error: null }

  try {
    steamOwned = await getOwnedSteamGames()
  } catch (error) {
    steamOwned = { games: [], configured: true, error: error.message }
  }

  const heroic = getHeroicGames()
  const prism = getPrismGames()
  const steamGames = steamOwned.configured ? steamOwned.games : steamInstalled.games
  const games = [...steamGames, ...heroic.games, ...prism.games]
    .map(({ instancePath, ...game }) => game)
    .sort((a, b) => {
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
        prism: { available: prism.available, count: 0 },
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
      prism: {
        available: prism.available,
        count: prism.games.length,
        root: prism.root,
        binary: Boolean(prism.binary),
      },
      demo: false,
    },
  }
}
