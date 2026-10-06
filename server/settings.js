import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULTS = {
  steamApiKey: '',
  steamId: '',
}

function settingsDir() {
  return path.join(os.homedir(), '.config', 'kanapa-game-library')
}

export function settingsPath() {
  return path.join(settingsDir(), 'settings.json')
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

export function loadSettings() {
  const stored = readJson(settingsPath(), {})
  return {
    steamApiKey: String(stored?.steamApiKey || ''),
    steamId: String(stored?.steamId || ''),
  }
}

export function saveSettings( partial = {}) {
  const current = loadSettings()
  const next = {
    steamApiKey:
      partial.steamApiKey !== undefined
        ? String(partial.steamApiKey || '').trim()
        : current.steamApiKey,
    steamId:
      partial.steamId !== undefined
        ? String(partial.steamId || '').trim()
        : current.steamId,
  }

  fs.mkdirSync(settingsDir(), { recursive: true })
  fs.writeFileSync(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  })
  try {
    fs.chmodSync(settingsPath(), 0o600)
  } catch {
    // ignore platforms that don't support chmod the same way
  }
  return next
}

/**
 * UI-editable settings win over `.env` / process env so the modal can
 * replace a bad key without restarting. Empty settings fall back to env.
 */
export function getSteamCredentials() {
  const settings = loadSettings()
  const apiKey = settings.steamApiKey || process.env.STEAM_API_KEY || ''
  const steamId = settings.steamId || process.env.STEAM_ID || ''
  return {
    apiKey: String(apiKey).trim(),
    steamId: String(steamId).trim(),
    source: settings.steamApiKey || settings.steamId ? 'settings' : 'env',
  }
}

export function getPublicSettings() {
  const settings = loadSettings()
  const creds = getSteamCredentials()
  const key = creds.apiKey
  return {
    steamId: creds.steamId,
    steamApiKeyConfigured: Boolean(key),
    steamApiKeyHint: key ? `••••${key.slice(-4)}` : '',
    steamConfigured: Boolean(creds.apiKey && creds.steamId),
    credentialSource: creds.apiKey || creds.steamId ? creds.source : 'none',
    settingsPath: settingsPath(),
    hasLocalSettings: Boolean(settings.steamApiKey || settings.steamId),
    defaults: DEFAULTS,
  }
}
