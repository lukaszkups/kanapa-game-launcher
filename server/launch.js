import { spawn } from 'node:child_process'
import { watchGameAndRestoreFocus } from './gameSession.js'
import {
  findHeroicAppImage,
  installHeroicGame,
  uninstallHeroicGame,
} from './heroic.js'
import { findPrismBinary } from './prism.js'
import { getActiveWindowId } from './window.js'

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

function openHeroic(uri) {
  const appImage = findHeroicAppImage()
  if (appImage) {
    return {
      method: 'heroic-appimage',
      uri,
      ...runDetached(appImage, ['--no-sandbox', uri]),
    }
  }
  return {
    method: 'heroic-uri',
    uri,
    ...openUri(uri),
  }
}

export function launchGame(game, action = 'launch') {
  if (!game) {
    throw new Error('Game not found')
  }

  const restoreWindowId = action === 'launch' ? getActiveWindowId() : null

  let result
  if (game.store === 'steam') {
    let uri = `steam://rungameid/${game.launchTarget}`
    if (action === 'install') uri = `steam://install/${game.launchTarget}`
    if (action === 'uninstall') uri = `steam://uninstall/${game.launchTarget}`
    result = {
      ok: true,
      method: 'steam-uri',
      uri,
      ...openUri(uri),
    }
  } else if (game.store === 'prism') {
    if (action === 'install' || action === 'uninstall') {
      throw new Error('Prism instances are managed inside Prism Launcher')
    }
    const binary = findPrismBinary()
    if (!binary) {
      throw new Error('Prism Launcher binary not found')
    }
    const args = [...binary.argsPrefix, '--launch', String(game.launchTarget)]
    result = {
      ok: true,
      method: 'prism-cli',
      ...runDetached(binary.command, args),
    }
  } else if (action === 'install' && game.source === 'heroic') {
    // Heroic's protocol "install?" Yes button is unreliable; drive installs via
    // Legendary/gogdl using Heroic's own config + default install path.
    const installed = installHeroicGame(game)
    if (installed) {
      result = installed
    } else {
      const runner = game.runner || (game.store === 'epic' ? 'legendary' : game.store)
      result = {
        ok: true,
        ...openHeroic(`heroic://launch/${runner}/${game.launchTarget}`),
      }
    }
  } else if (action === 'uninstall' && game.source === 'heroic') {
    result = uninstallHeroicGame(game)
  } else {
    const runner = game.runner || (game.store === 'epic' ? 'legendary' : game.store)
    const uri = `heroic://launch/${runner}/${game.launchTarget}`
    result = {
      ok: true,
      ...openHeroic(uri),
    }
  }

  if (restoreWindowId) {
    watchGameAndRestoreFocus(game, restoreWindowId)
    result.focusRestore = true
    result.focusWindowId = restoreWindowId
  } else if (action === 'launch') {
    result.focusRestore = false
  }

  return result
}
