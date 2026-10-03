import { spawn } from 'node:child_process'
import { findHeroicAppImage } from './heroic.js'

function runDetached(command, args = []) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return { command, args }
}

function openUri(uri) {
  return runDetached('xdg-open', [uri])
}

export function launchGame(game, action = 'launch') {
  if (!game) {
    throw new Error('Game not found')
  }

  if (game.store === 'steam') {
    const uri =
      action === 'install'
        ? `steam://install/${game.launchTarget}`
        : `steam://rungameid/${game.launchTarget}`
    return {
      ok: true,
      method: 'steam-uri',
      uri,
      ...openUri(uri),
    }
  }

  const runner = game.runner || (game.store === 'epic' ? 'legendary' : game.store)
  const uri =
    action === 'install'
      ? `heroic://install/${runner}/${game.launchTarget}`
      : `heroic://launch/${runner}/${game.launchTarget}`

  try {
    return {
      ok: true,
      method: 'heroic-uri',
      uri,
      ...openUri(uri),
    }
  } catch (error) {
    const appImage = findHeroicAppImage()
    if (!appImage) throw error
    return {
      ok: true,
      method: 'heroic-appimage',
      uri,
      ...runDetached(appImage, ['--no-sandbox', uri]),
    }
  }
}
