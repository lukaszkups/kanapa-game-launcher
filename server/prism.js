import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_MINECRAFT_IMAGE } from './enrich.js'

function candidateRoots() {
  const home = os.homedir()
  return [
    path.join(home, '.local/share/PrismLauncher'),
    path.join(home, '.local/share/prismlauncher'),
    path.join(
      home,
      '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher',
    ),
    path.join(home, 'snap/prismlauncher/common/PrismLauncher'),
  ]
}

function parseCfg(text) {
  const out = {}
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  return out
}

function readCfg(filePath) {
  try {
    return parseCfg(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function which(command) {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function findPrismRoot() {
  for (const root of candidateRoots()) {
    if (fs.existsSync(path.join(root, 'instances'))) return root
    if (fs.existsSync(path.join(root, 'prismlauncher.cfg'))) return root
  }
  return null
}

export function findPrismBinary() {
  const direct = which('prismlauncher') || which('prism-launcher')
  if (direct) return { command: direct, argsPrefix: [] }

  try {
    const flatpaks = execFileSync('flatpak', ['list', '--app', '--columns=application'], {
      encoding: 'utf8',
    })
    if (flatpaks.includes('org.prismlauncher.PrismLauncher')) {
      return {
        command: 'flatpak',
        argsPrefix: ['run', 'org.prismlauncher.PrismLauncher'],
      }
    }
  } catch {
    // ignore
  }

  const applications = path.join(os.homedir(), 'Applications')
  if (fs.existsSync(applications)) {
    const match = fs
      .readdirSync(applications)
      .find((name) => /prism/i.test(name) && name.endsWith('.AppImage'))
    if (match) {
      return { command: path.join(applications, match), argsPrefix: [] }
    }
  }

  return null
}

export function instancesDir(root) {
  const cfg = readCfg(path.join(root, 'prismlauncher.cfg'))
  const configured = cfg.InstanceDir || cfg.InstancesDir
  if (!configured) return path.join(root, 'instances')
  if (path.isAbsolute(configured)) return configured
  return path.join(root, configured)
}

export function resolvePrismInstancePath(instanceId) {
  const root = findPrismRoot()
  if (!root || !instanceId) return null
  const dir = path.join(instancesDir(root), instanceId)
  return fs.existsSync(dir) ? dir : null
}

function minecraftVersion(instancePath) {
  const pack = readJson(path.join(instancePath, 'mmc-pack.json'), null)
  const components = pack?.components || []
  const mc = components.find((entry) => entry?.uid === 'net.minecraft')
  return mc?.version || ''
}

function loaderSummary(instancePath) {
  const pack = readJson(path.join(instancePath, 'mmc-pack.json'), null)
  const components = pack?.components || []
  const loaders = []
  for (const entry of components) {
    const uid = String(entry?.uid || '')
    if (uid.includes('fabric')) loaders.push(`Fabric ${entry.version || ''}`.trim())
    else if (uid.includes('quilt')) loaders.push(`Quilt ${entry.version || ''}`.trim())
    else if (uid.includes('forge') && !uid.includes('neoforge')) {
      loaders.push(`Forge ${entry.version || ''}`.trim())
    } else if (uid.includes('neoforge')) {
      loaders.push(`NeoForge ${entry.version || ''}`.trim())
    }
  }
  return loaders[0] || ''
}

export function resolvePrismIconPath(instanceId) {
  const root = findPrismRoot()
  if (!root) return null
  const dir = path.join(instancesDir(root), instanceId)
  if (!fs.existsSync(dir)) return null

  const packPng = path.join(dir, 'pack.png')
  if (fs.existsSync(packPng)) return packPng

  const cfg = readCfg(path.join(dir, 'instance.cfg'))
  const iconKey = cfg.iconKey || cfg.IconKey
  if (!iconKey || iconKey === 'default') return null

  const iconsDir = path.join(root, 'icons')
  if (!fs.existsSync(iconsDir)) return null

  for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.ico', '.svg']) {
    const candidate = path.join(iconsDir, `${iconKey}${ext}`)
    if (fs.existsSync(candidate)) return candidate
  }

  // Prism sometimes stores icons without extension matching exact filename
  try {
    const match = fs.readdirSync(iconsDir).find((name) => {
      const base = name.replace(/\.[^.]+$/, '')
      return base === iconKey
    })
    if (match) return path.join(iconsDir, match)
  } catch {
    // ignore
  }

  return null
}

function normalizeInstance(root, instanceId) {
  const instancePath = path.join(instancesDir(root), instanceId)
  const cfgPath = path.join(instancePath, 'instance.cfg')
  if (!fs.existsSync(cfgPath)) return null

  const cfg = readCfg(cfgPath)
  const title = cfg.name || cfg.Name || instanceId
  const mcVersion = minecraftVersion(instancePath)
  const loader = loaderSummary(instancePath)
  const lastLaunchMs = Number(cfg.lastLaunchTime || cfg.LastLaunchTime || 0)
  const playtimeSeconds = Number(cfg.totalTimePlayed || cfg.TotalTimePlayed || 0)

  const metaBits = []
  if (mcVersion) metaBits.push(`Minecraft ${mcVersion}`)
  if (loader) metaBits.push(loader)

  return {
    id: `prism:${instanceId}`,
    appId: instanceId,
    title,
    store: 'prism',
    runner: 'prism',
    installed: true,
    cover: DEFAULT_MINECRAFT_IMAGE,
    hero: DEFAULT_MINECRAFT_IMAGE,
    header: DEFAULT_MINECRAFT_IMAGE,
    developer: 'Mojang Studios',
    description:
      'Minecraft sandbox world via Prism Launcher' +
      (metaBits.length ? ` · ${metaBits.join(' · ')}` : ''),
    playtimeForever: Math.round(playtimeSeconds / 60),
    lastPlayed: lastLaunchMs > 0 ? Math.floor(lastLaunchMs / 1000) : null,
    launchTarget: instanceId,
    canInstall: false,
    canLaunch: true,
    canUninstall: false,
    source: 'prism',
    instancePath,
    minecraftVersion: mcVersion,
    loader,
  }
}

export function getPrismGames() {
  const root = findPrismRoot()
  if (!root) {
    return { games: [], available: false, root: null, binary: null }
  }

  const dir = instancesDir(root)
  const binary = findPrismBinary()
  if (!fs.existsSync(dir)) {
    return { games: [], available: true, root, binary }
  }

  const games = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    const game = normalizeInstance(root, entry.name)
    if (game) games.push(game)
  }

  games.sort((a, b) => {
    const aTime = a.lastPlayed || 0
    const bTime = b.lastPlayed || 0
    if (aTime !== bTime) return bTime - aTime
    return a.title.localeCompare(b.title)
  })

  return { games, available: true, root, binary }
}
