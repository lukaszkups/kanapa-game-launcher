import { computed, ref } from 'vue'

const games = ref([])
const sources = ref(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const filter = ref('all')
const query = ref('')
const shopDetails = ref(null)
const shopLoading = ref(false)
let shopRequestId = 0

export function useLibrary() {
  const stores = computed(() => {
    const counts = new Map()
    for (const game of games.value) {
      counts.set(game.store, (counts.get(game.store) || 0) + 1)
    }
    return [...counts.entries()].map(([id, count]) => ({ id, count }))
  })

  const filteredGames = computed(() => {
    const needle = query.value.trim().toLowerCase()
    return games.value.filter((game) => {
      if (filter.value === 'installed' && !game.installed) return false
      if (filter.value !== 'all' && filter.value !== 'installed' && game.store !== filter.value) {
        return false
      }
      if (!needle) return true
      return (
        game.title.toLowerCase().includes(needle) ||
        game.developer?.toLowerCase().includes(needle) ||
        game.store.toLowerCase().includes(needle)
      )
    })
  })

  async function loadLibrary() {
    loading.value = true
    error.value = ''
    try {
      const response = await fetch('/api/library')
      if (!response.ok) {
        throw new Error(`Library request failed (${response.status})`)
      }
      const payload = await response.json()
      games.value = payload.games || []
      sources.value = payload.sources || null
    } catch (err) {
      error.value = err.message || 'Could not reach the local bridge.'
      games.value = []
      sources.value = null
    } finally {
      loading.value = false
    }
  }

  async function refreshGame(gameId) {
    if (!gameId) return null
    try {
      const response = await fetch('/api/library')
      if (!response.ok) {
        throw new Error(`Library request failed (${response.status})`)
      }
      const payload = await response.json()
      const nextGames = payload.games || []
      const updated = nextGames.find((entry) => entry.id === gameId)
      if (!updated) return null

      const index = games.value.findIndex((entry) => entry.id === gameId)
      if (index === -1) return updated

      // Patch in place so the grid keeps scroll/selection.
      const patched = games.value.slice()
      patched[index] = { ...patched[index], ...updated }
      games.value = patched

      if (shopDetails.value?.id === gameId) {
        shopDetails.value = {
          ...shopDetails.value,
          installed: updated.installed,
          canInstall: updated.canInstall,
          canLaunch: updated.canLaunch,
          canUninstall: updated.canUninstall,
        }
      }

      if (payload.sources) sources.value = payload.sources
      return updated
    } catch (err) {
      error.value = err.message || 'Could not refresh game'
      return null
    }
  }

  async function refreshGameUntil(gameId, predicate, { attempts = 8, delayMs = 1500 } = {}) {
    let updated = await refreshGame(gameId)
    for (let i = 0; i < attempts; i++) {
      if (updated && predicate(updated)) return updated
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      updated = await refreshGame(gameId)
    }
    return updated
  }

  async function loadShopDetails(game) {
    const requestId = ++shopRequestId
    if (!game) {
      shopDetails.value = null
      shopLoading.value = false
      return
    }

    shopLoading.value = true
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/details`)
      const payload = await response.json()
      if (requestId !== shopRequestId) return
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load shop details')
      }
      shopDetails.value = payload
    } catch (err) {
      if (requestId !== shopRequestId) return
      shopDetails.value = null
      error.value = err.message || 'Failed to load shop details'
    } finally {
      if (requestId === shopRequestId) shopLoading.value = false
    }
  }

  async function actOnGame(game, action = 'launch') {
    notice.value = ''
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: game.id, action }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Action failed')
      }
      notice.value = payload.message || 'Done'
      return payload
    } catch (err) {
      error.value = err.message || 'Action failed'
      throw err
    }
  }

  return {
    games,
    sources,
    loading,
    error,
    notice,
    filter,
    query,
    stores,
    filteredGames,
    shopDetails,
    shopLoading,
    loadLibrary,
    refreshGame,
    refreshGameUntil,
    loadShopDetails,
    actOnGame,
  }
}
