const wikiCache = new Map()
const steamSearchCache = new Map()

const WIKI_UA = 'GamepadLibrary/0.1 (local game library; enrichment)'

function cleanImageUrl(url = '') {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    return parsed.toString()
  } catch {
    return url
  }
}

function needsEnrichment(details) {
  const description = String(details?.description || details?.longDescription || '').trim()
  const screenshots = details?.screenshots || []
  return screenshots.length < 3 && description.length < 100
}

function mergeScreenshots(existing = [], incoming = []) {
  const seen = new Set(existing.map((shot) => shot.full || shot.thumbnail))
  const merged = [...existing]
  for (const shot of incoming) {
    const url = shot.full || shot.thumbnail
    if (!url || seen.has(url)) continue
    seen.add(url)
    merged.push({
      id: String(merged.length),
      thumbnail: shot.thumbnail || url,
      full: shot.full || url,
    })
  }
  return merged
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': WIKI_UA,
      ...headers,
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`)
  }
  return response.json()
}

async function enrichFromSteamStore(details) {
  const title = details.title
  if (!title) return details
  if (steamSearchCache.has(title)) {
    return applySteamEnrichment(details, steamSearchCache.get(title))
  }

  const searchUrl = new URL('https://store.steampowered.com/api/storesearch/')
  searchUrl.searchParams.set('term', title)
  searchUrl.searchParams.set('l', 'english')
  searchUrl.searchParams.set('cc', 'US')

  const search = await fetchJson(searchUrl)
  const items = search?.items || []
  if (!items.length) {
    steamSearchCache.set(title, null)
    return details
  }

  const normalized = title.toLowerCase()
  const match =
    items.find((item) => String(item.name || '').toLowerCase() === normalized) ||
    items.find((item) => String(item.name || '').toLowerCase().includes(normalized)) ||
    items[0]

  const appId = String(match?.id || '')
  if (!appId) {
    steamSearchCache.set(title, null)
    return details
  }

  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=english`
  const payload = await fetchJson(detailsUrl, { 'User-Agent': 'gamepad-library/0.1' })
  const entry = payload?.[appId]
  if (!entry?.success || !entry.data) {
    steamSearchCache.set(title, null)
    return details
  }

  steamSearchCache.set(title, entry.data)
  return applySteamEnrichment(details, entry.data)
}

function applySteamEnrichment(details, data) {
  if (!data) return details

  const description =
    String(data.short_description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || details.description

  const longDescription =
    String(data.about_the_game || data.detailed_description || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim() || details.longDescription

  const screenshots = mergeScreenshots(
    details.screenshots,
    (data.screenshots || []).map((shot) => ({
      thumbnail: shot.path_thumbnail,
      full: shot.path_full,
    })),
  )

  return {
    ...details,
    description: details.description?.length >= 100 ? details.description : description || details.description,
    longDescription:
      details.longDescription?.length >= 100
        ? details.longDescription
        : longDescription || details.longDescription,
    developer:
      details.developer ||
      (data.developers || []).join(', ') ||
      details.developer,
    publisher:
      details.publisher ||
      (data.publishers || []).join(', ') ||
      details.publisher,
    releaseDate: details.releaseDate || data.release_date?.date || '',
    genres:
      details.genres?.length
        ? details.genres
        : (data.genres || []).map((genre) => genre.description).filter(Boolean),
    cover: details.cover || data.capsule_image || details.cover,
    hero: details.hero || data.header_image || details.hero,
    screenshots,
    enrichedFrom: [...new Set([...(details.enrichedFrom || []), 'steam-store'])],
  }
}

function scoreWikiTitle(candidate, gameTitle) {
  const title = candidate.toLowerCase()
  const needle = gameTitle.toLowerCase()
  let score = 0
  if (title === `${needle} (video game)`) score += 100
  if (title.includes('(video game)')) score += 40
  if (title.includes('(game)')) score += 20
  if (title.startsWith(needle)) score += 30
  if (title.includes(needle)) score += 15
  if (title.includes('film') || title.includes('soundtrack') || title.includes('glossary')) score -= 50
  return score
}

async function findWikipediaPage(title) {
  const queries = [`${title} (video game)`, `${title} video game`, title]
  let best = null

  for (const query of queries) {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', query)
    url.searchParams.set('srlimit', '5')
    url.searchParams.set('format', 'json')

    const payload = await fetchJson(url)
    const hits = payload?.query?.search || []
    for (const hit of hits) {
      const scored = { title: hit.title, score: scoreWikiTitle(hit.title, title) }
      if (!best || scored.score > best.score) best = scored
    }
    if (best && best.score >= 70) break
  }

  return best && best.score > 0 ? best.title : null
}

function isUsefulWikiImage(name = '', info = {}) {
  const lower = name.toLowerCase()
  if (!/\.(jpe?g|png|webp)$/i.test(lower)) return false
  if (
    /logo|icon|commons-logo|edit-clear|question_book|ambox|wiki_letter|symbol|badge|svg/i.test(
      lower,
    )
  ) {
    return false
  }
  const width = Number(info.width || 0)
  const height = Number(info.height || 0)
  if (width && width < 350) return false
  if (height && height < 200) return false
  return Boolean(info.url)
}

async function enrichFromWikipedia(details) {
  const title = details.title
  if (!title) return details
  if (wikiCache.has(title)) {
    return applyWikiEnrichment(details, wikiCache.get(title))
  }

  const pageTitle = await findWikipediaPage(title)
  if (!pageTitle) {
    wikiCache.set(title, null)
    return details
  }

  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    pageTitle.replace(/ /g, '_'),
  )}`
  const summary = await fetchJson(summaryUrl)

  const imagesUrl = new URL('https://en.wikipedia.org/w/api.php')
  imagesUrl.searchParams.set('action', 'query')
  imagesUrl.searchParams.set('generator', 'images')
  imagesUrl.searchParams.set('titles', pageTitle)
  imagesUrl.searchParams.set('prop', 'imageinfo')
  imagesUrl.searchParams.set('iiprop', 'url|size|mime')
  imagesUrl.searchParams.set('gimlimit', '12')
  imagesUrl.searchParams.set('format', 'json')

  let imagePages = {}
  try {
    const imagePayload = await fetchJson(imagesUrl)
    imagePages = imagePayload?.query?.pages || {}
  } catch {
    imagePages = {}
  }

  const screenshots = []
  const summaryImage = summary.originalimage?.source || summary.thumbnail?.source
  if (summaryImage) {
    screenshots.push({
      thumbnail: cleanImageUrl(summary.thumbnail?.source || summaryImage),
      full: cleanImageUrl(summaryImage),
    })
  }

  const ranked = Object.values(imagePages)
    .map((page) => {
      const info = (page.imageinfo || [])[0] || {}
      return { title: page.title || '', info }
    })
    .filter((item) => isUsefulWikiImage(item.title, item.info))
    .sort((a, b) => {
      const aShot = /screenshot|gameplay/i.test(a.title) ? 1 : 0
      const bShot = /screenshot|gameplay/i.test(b.title) ? 1 : 0
      if (aShot !== bShot) return bShot - aShot
      return Number(b.info.width || 0) - Number(a.info.width || 0)
    })

  for (const item of ranked) {
    screenshots.push({
      thumbnail: cleanImageUrl(item.info.url),
      full: cleanImageUrl(item.info.url),
    })
  }

  const payload = {
    pageTitle,
    extract: summary.extract || '',
    description: summary.description || '',
    cover: cleanImageUrl(summaryImage || ''),
    screenshots,
    url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
  }

  wikiCache.set(title, payload)
  return applyWikiEnrichment(details, payload)
}

function applyWikiEnrichment(details, payload) {
  if (!payload) return details

  const description =
    details.description?.length >= 100
      ? details.description
      : payload.extract || details.description

  const longDescription =
    details.longDescription?.length >= 100
      ? details.longDescription
      : payload.extract || details.longDescription

  return {
    ...details,
    description,
    longDescription,
    cover: details.cover || payload.cover || details.cover,
    hero: details.hero || payload.cover || details.hero,
    screenshots: mergeScreenshots(details.screenshots, payload.screenshots),
    wikipediaUrl: payload.url,
    enrichedFrom: [...new Set([...(details.enrichedFrom || []), 'wikipedia'])],
  }
}

/** Single default art used for all Prism / Minecraft library entries. */
export const DEFAULT_MINECRAFT_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/3/37/Minecraft_Key-art.png'

export function getMinecraftMedia() {
  return {
    cover: DEFAULT_MINECRAFT_IMAGE,
    hero: DEFAULT_MINECRAFT_IMAGE,
    header: DEFAULT_MINECRAFT_IMAGE,
    screenshots: [],
  }
}

export async function enrichSparseDetails(details) {
  if (!details || !needsEnrichment(details)) return details

  let enriched = details

  try {
    if (
      needsEnrichment(enriched) &&
      enriched.store !== 'steam' &&
      enriched.store !== 'prism'
    ) {
      enriched = await enrichFromSteamStore(enriched)
    }
  } catch {
    // keep current details
  }

  try {
    if (needsEnrichment(enriched) && enriched.store !== 'prism') {
      enriched = await enrichFromWikipedia(enriched)
    }
  } catch {
    // keep current details
  }

  return enriched
}
