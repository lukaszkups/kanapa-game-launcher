import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { enrichSparseDetails, getMinecraftMedia } from './enrich.js'
import { collectLibrary } from './library.js'

const steamCache = new Map()

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

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function localize(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value['en-US'] || value['*'] || value.en || Object.values(value)[0] || ''
  }
  return String(value)
}

function gogImageUrl(image) {
  if (!image) return ''
  if (typeof image === 'string') return image
  const format = image.url_format || image.url || ''
  if (!format) return ''
  return format.replace('{formatter}', '').replace('{ext}', 'jpg')
}

function baseDetails(game) {
  return {
    id: game.id,
    appId: game.appId,
    title: game.title,
    store: game.store,
    runner: game.runner,
    installed: game.installed,
    canLaunch: game.canLaunch,
    canInstall: game.canInstall,
    canUninstall: game.canUninstall,
    cover: game.cover,
    hero: game.hero || game.header || game.cover,
    header: game.header || game.hero || game.cover,
    developer: game.developer || '',
    publisher: '',
    description: game.description || '',
    longDescription: '',
    releaseDate: '',
    genres: [],
    screenshots: [],
    storeUrl: game.storeUrl || '',
    playtimeForever: game.playtimeForever || 0,
  }
}

async function getSteamShopDetails(game) {
  const appId = game.appId
  if (steamCache.has(appId)) return steamCache.get(appId)

  const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=english`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'gamepad-library/0.1' },
  })
  if (!response.ok) {
    throw new Error(`Steam store request failed (${response.status})`)
  }

  const payload = await response.json()
  const entry = payload?.[appId]
  if (!entry?.success || !entry.data) {
    const fallback = {
      ...baseDetails(game),
      storeUrl: `https://store.steampowered.com/app/${appId}`,
    }
    steamCache.set(appId, fallback)
    return fallback
  }

  const data = entry.data
  const details = {
    ...baseDetails(game),
    title: data.name || game.title,
    description:
      stripHtml(data.short_description) ||
      stripHtml(data.about_the_game) ||
      game.description,
    longDescription: stripHtml(data.about_the_game || data.detailed_description || ''),
    developer: (data.developers || []).join(', ') || game.developer,
    publisher: (data.publishers || []).join(', '),
    releaseDate: data.release_date?.date || '',
    genres: (data.genres || []).map((genre) => genre.description).filter(Boolean),
    screenshots: (data.screenshots || []).map((shot) => ({
      id: String(shot.id),
      thumbnail: shot.path_thumbnail,
      full: shot.path_full,
    })),
    cover: data.capsule_image || game.cover,
    hero: data.header_image || data.background || game.hero,
    storeUrl: `https://store.steampowered.com/app/${appId}`,
  }

  steamCache.set(appId, details)
  return details
}

function getGogShopDetails(game) {
  const root = heroicRoot()
  const api = readJson(path.join(root, 'store_cache', 'gog_api_info.json'), {})
  const info = api[`gog_${game.appId}`] || {}
  const meta = info.game || {}

  const screenshots = (meta.screenshots || [])
    .map((shot, index) => {
      const full = gogImageUrl(shot)
      return full
        ? {
            id: String(index),
            thumbnail: full,
            full,
          }
        : null
    })
    .filter(Boolean)

  const slug = meta.slug || ''
  return {
    ...baseDetails(game),
    description: localize(meta.summary) || localize(info.summary) || game.description,
    longDescription: localize(meta.summary) || localize(info.summary) || '',
    developer:
      (meta.developers || []).map((item) => item.name).filter(Boolean).join(', ') ||
      game.developer,
    publisher: (meta.publishers || []).map((item) => item.name).filter(Boolean).join(', '),
    releaseDate: (meta.first_release_date || info.first_release_date || '').slice(0, 10),
    genres: (meta.genres || []).map((genre) => localize(genre.name)).filter(Boolean),
    screenshots,
    cover: gogImageUrl(meta.vertical_cover) || game.cover,
    hero:
      gogImageUrl(meta.horizontal_artwork) ||
      gogImageUrl(meta.background) ||
      game.hero,
    storeUrl: slug
      ? `https://www.gog.com/en/game/${slug}`
      : `https://www.gog.com/en/game/${game.appId}`,
  }
}

const epicCache = new Map()

function epicSlugFromUrl(storeUrl = '') {
  if (!storeUrl) return ''
  try {
    const url = new URL(storeUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const productIndex = parts.findIndex((part) => part === 'product' || part === 'p')
    if (productIndex >= 0 && parts[productIndex + 1]) {
      return decodeURIComponent(parts[productIndex + 1])
    }
    return decodeURIComponent(parts.at(-1) || '')
  } catch {
    return storeUrl.split('/').filter(Boolean).at(-1) || ''
  }
}

function epicProductPageUrl(slug) {
  const cleaned = String(slug || '').trim()
  if (!cleaned) return ''
  return `https://store.epicgames.com/en-US/p/${encodeURIComponent(cleaned)}`
}

function epicBrowseSearchUrl(title = '') {
  const query = String(title || '').trim()
  if (!query) return 'https://store.epicgames.com/en-US/browse'
  return `https://store.epicgames.com/en-US/browse?q=${encodeURIComponent(query)}`
}

function slugifyEpicTitle(title = '') {
  return String(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®]/g, '')
    .replace(/[^\w\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function epicSlugCandidates(storeUrl, title = '') {
  const slug = epicSlugFromUrl(storeUrl)
  const candidates = []
  if (slug) {
    candidates.push(slug)
    candidates.push(slug.replace(/--+/g, '-'))
    candidates.push(slug.replace(/-\([^)]*\)/g, '').replace(/\([^)]*\)/g, ''))
  }
  const fromTitle = slugifyEpicTitle(title)
  if (fromTitle) candidates.push(fromTitle)
  return [...new Set(candidates.filter(Boolean))]
}

async function resolveEpicStoreLink({ storeUrl, title }) {
  const candidates = epicSlugCandidates(storeUrl, title)
  for (const candidate of candidates.slice(0, 5)) {
    const product = await fetchEpicStoreProduct(candidate)
    if (product?._slug) {
      return {
        storeUrl: epicProductPageUrl(product._slug),
        slug: product._slug,
        product,
      }
    }
  }

  // Heroic still ships legacy epicgames.com/store/product/… links; many slugs
  // no longer resolve. Prefer store search over a dead product URL.
  if (title) {
    return {
      storeUrl: epicBrowseSearchUrl(title),
      slug: candidates[0] || '',
      product: null,
    }
  }

  const slug = candidates[0] || epicSlugFromUrl(storeUrl)
  return {
    storeUrl: slug ? epicProductPageUrl(slug) : '',
    slug,
    product: null,
  }
}

function pickEpicProductPage(product) {
  const pages = product?.pages || []
  return (
    pages.find((page) => page.type === 'productHome' || page._slug === 'home') ||
    pages.find((page) => page.type === 'offer') ||
    pages[0] ||
    null
  )
}

function collectEpicScreenshots(page) {
  const data = page?.data || {}
  const urls = []

  for (const item of data.carousel?.items || []) {
    const src = item?.image?.src
    if (src) urls.push(src)
  }

  for (const image of data.gallery?.galleryImages || []) {
    const src = image?.src
    if (src) urls.push(src)
  }

  const aboutImage = data.about?.image?.src
  if (aboutImage) urls.push(aboutImage)

  return [...new Set(urls)].map((url, index) => ({
    id: String(index),
    thumbnail: url,
    full: url,
  }))
}

function localEpicFallback(game) {
  const root = heroicRoot()
  const library = readJson(path.join(root, 'store_cache', 'legendary_library.json'), {
    library: [],
  })
  const entry =
    (library.library || []).find((item) => item.app_name === game.appId) || null
  const info = readJson(path.join(root, 'store_cache', 'legendary_gameinfo.json'), {})
  const about = info[game.appId]?.about || entry?.extra?.about || {}
  const meta = readJson(
    path.join(root, 'legendaryConfig', 'legendary', 'metadata', `${game.appId}.json`),
    null,
  )
  const keyImages = meta?.metadata?.keyImages || []
  const imageUrls = keyImages.map((image) => image.url).filter(Boolean)

  const rawStoreUrl =
    info[game.appId]?.storeUrl ||
    entry?.extra?.storeUrl ||
    entry?.store_url ||
    game.storeUrl ||
    ''
  const slug = epicSlugCandidates(rawStoreUrl, game.title || entry?.title || '')[0] || ''
  const storeUrl = slug
    ? epicProductPageUrl(slug)
    : epicBrowseSearchUrl(game.title || entry?.title || '')

  return {
    ...baseDetails(game),
    description:
      about.description ||
      about.shortDescription ||
      stripHtml(meta?.metadata?.longDescription || meta?.metadata?.description || '') ||
      game.description,
    longDescription:
      about.description ||
      stripHtml(meta?.metadata?.longDescription || meta?.metadata?.description || '') ||
      '',
    developer: entry?.developer || meta?.metadata?.developer || game.developer,
    releaseDate: info[game.appId]?.releaseDate || '',
    screenshots: [...imageUrls, game.hero, game.cover, game.header]
      .filter(Boolean)
      .filter((url, index, list) => list.indexOf(url) === index)
      .map((url, index) => ({
        id: String(index),
        thumbnail: url,
        full: url,
      })),
    storeUrl,
    legacyStoreUrl: rawStoreUrl,
    slug,
  }
}

async function fetchEpicStoreProduct(slug) {
  if (!slug) return null
  const url = `https://store-content.ak.epicgames.com/api/en-US/content/products/${encodeURIComponent(slug)}`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'gamepad-library/0.1' },
  })
  if (!response.ok) return null
  return response.json()
}

async function getEpicShopDetails(game) {
  if (epicCache.has(game.id)) return epicCache.get(game.id)

  const local = localEpicFallback(game)
  let details = local

  try {
    const resolved = await resolveEpicStoreLink({
      storeUrl: local.legacyStoreUrl || local.storeUrl,
      title: game.title || local.title,
    })
    const product = resolved.product
    const page = product ? pickEpicProductPage(product) : null
    if (page) {
      const about = page.data?.about || {}
      const screenshots = collectEpicScreenshots(page)
      const cover = about.image?.src || local.cover
      const hero = screenshots[0]?.full || local.hero

      details = {
        ...local,
        title: about.title || page.productName || local.title,
        description:
          stripHtml(about.shortDescription || about.description || '') || local.description,
        longDescription:
          stripHtml(about.description || about.shortDescription || '') || local.longDescription,
        cover,
        hero,
        screenshots: screenshots.length ? screenshots : local.screenshots,
        storeUrl: resolved.storeUrl,
        slug: resolved.slug,
      }
    } else {
      details = {
        ...local,
        storeUrl: resolved.storeUrl,
        slug: resolved.slug,
      }
    }
  } catch {
    details = {
      ...local,
      storeUrl: local.title ? epicBrowseSearchUrl(local.title) : local.storeUrl,
    }
  }

  epicCache.set(game.id, details)
  return details
}

function getAmazonShopDetails(game) {
  return {
    ...baseDetails(game),
    screenshots: [game.hero, game.cover]
      .filter(Boolean)
      .map((url, index) => ({
        id: String(index),
        thumbnail: url,
        full: url,
      })),
  }
}

const MINECRAFT_DESCRIPTION =
  'Minecraft is a sandbox game about placing blocks and going on adventures. Explore randomly generated worlds, gather resources, craft tools, build structures, and survive against mobs — alone or with friends.'

function getPrismShopDetails(game) {
  const media = getMinecraftMedia()
  const versionBits = []
  if (game.minecraftVersion) versionBits.push(`Minecraft ${game.minecraftVersion}`)
  if (game.loader) versionBits.push(game.loader)
  const instanceLine = versionBits.length
    ? `Prism instance “${game.title}” (${versionBits.join(' · ')}).`
    : `Prism instance “${game.title}”.`

  return {
    ...baseDetails(game),
    publisher: 'Mojang Studios',
    description: MINECRAFT_DESCRIPTION,
    longDescription: `${MINECRAFT_DESCRIPTION}\n\n${instanceLine} Launched through Prism Launcher.`,
    releaseDate: game.minecraftVersion || '',
    genres: ['Sandbox', 'Survival', 'Minecraft', game.loader].filter(Boolean),
    cover: media.cover,
    hero: media.hero,
    header: media.header,
    screenshots: [],
    storeUrl: 'https://www.minecraft.net/',
    developer: 'Mojang Studios',
    enrichedFrom: ['minecraft'],
  }
}

export async function getGameDetails(id) {
  const { games } = await collectLibrary()
  const game = games.find((entry) => entry.id === id)
  if (!game) return null

  let details
  if (game.store === 'steam') details = await getSteamShopDetails(game)
  else if (game.store === 'gog') details = getGogShopDetails(game)
  else if (game.store === 'epic') details = await getEpicShopDetails(game)
  else if (game.store === 'amazon') details = getAmazonShopDetails(game)
  else if (game.store === 'prism') details = await getPrismShopDetails(game)
  else details = baseDetails(game)

  return enrichSparseDetails(details)
}
