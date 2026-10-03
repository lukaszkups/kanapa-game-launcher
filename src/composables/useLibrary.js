import { computed, ref } from 'vue'

const games = ref([])
const sources = ref(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const filter = ref('all')
const query = ref('')

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
    loadLibrary,
    actOnGame,
  }
}
