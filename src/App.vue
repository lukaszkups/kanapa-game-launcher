<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import GameCard from './components/GameCard.vue'
import GameDetails from './components/GameDetails.vue'
import { useGamepad } from './composables/useGamepad.js'
import { useLibrary } from './composables/useLibrary.js'

const {
  filteredGames,
  stores,
  loading,
  error,
  notice,
  filter,
  query,
  sources,
  loadLibrary,
  actOnGame,
} = useLibrary()

const selectedIndex = ref(0)
const detailsOpen = ref(false)
const busy = ref(false)
const gridColumns = ref(4)

const selectedGame = computed(
  () => filteredGames.value[selectedIndex.value] || filteredGames.value[0] || null,
)

function measureColumns() {
  const width = window.innerWidth
  if (width < 640) gridColumns.value = 1
  else if (width < 900) gridColumns.value = 2
  else if (width < 1200) gridColumns.value = 3
  else gridColumns.value = 4
}

function ensureSelection() {
  if (!filteredGames.value.length) {
    selectedIndex.value = 0
    return
  }
  if (selectedIndex.value > filteredGames.value.length - 1) {
    selectedIndex.value = filteredGames.value.length - 1
  }
}

async function scrollSelectedIntoView() {
  await nextTick()
  document
    .querySelector('.card.active')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

async function openDetails() {
  if (!selectedGame.value) return
  detailsOpen.value = true
}

async function launchSelected() {
  if (!selectedGame.value?.canLaunch || busy.value) return
  busy.value = true
  try {
    await actOnGame(selectedGame.value, 'launch')
  } finally {
    busy.value = false
  }
}

async function installSelected() {
  if (!selectedGame.value?.canInstall || busy.value) return
  busy.value = true
  try {
    await actOnGame(selectedGame.value, 'install')
  } finally {
    busy.value = false
  }
}

const { connected, hint } = useGamepad({
  itemCount: () => filteredGames.value.length,
  columns: () => gridColumns.value,
  selectedIndex: () => selectedIndex.value,
  detailsOpen: () => detailsOpen.value,
  onMove: (index) => {
    selectedIndex.value = index
    scrollSelectedIntoView()
  },
  onConfirm: () => {
    if (detailsOpen.value) launchSelected()
    else launchSelected()
  },
  onBack: () => {
    detailsOpen.value = false
  },
  onSecondary: () => {
    if (detailsOpen.value) detailsOpen.value = false
    else openDetails()
  },
  onInstall: () => installSelected(),
})

watch([filter, query, filteredGames], () => {
  ensureSelection()
})

onMounted(async () => {
  measureColumns()
  window.addEventListener('resize', measureColumns)
  await loadLibrary()
  ensureSelection()
})
</script>

<template>
  <div class="shell">
    <div class="atmosphere" aria-hidden="true"></div>

    <header class="hero">
      <div>
        <p class="brand">Gamepad Library</p>
        <h1>Your games. One couch UI.</h1>
        <p class="lede">
          Browse Steam and Heroic (Epic, GOG, Amazon) locally, move with a controller, then launch or
          install through the real store apps.
        </p>
      </div>

      <div class="hero-aside">
        <p class="pad" :class="{ on: connected }">
          {{ connected ? 'Gamepad connected' : 'Keyboard ready' }}
        </p>
        <p class="hint">{{ hint }}</p>
      </div>
    </header>

    <section class="toolbar">
      <div class="filters" role="tablist" aria-label="Library filters">
        <button
          type="button"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          All
        </button>
        <button
          type="button"
          :class="{ active: filter === 'installed' }"
          @click="filter = 'installed'"
        >
          Installed
        </button>
        <button
          v-for="store in stores"
          :key="store.id"
          type="button"
          :class="{ active: filter === store.id }"
          @click="filter = store.id"
        >
          {{ store.id }}
          <span>{{ store.count }}</span>
        </button>
      </div>

      <label class="search">
        <span>Search</span>
        <input v-model="query" type="search" placeholder="Find a title" />
      </label>
    </section>

    <p v-if="loading" class="banner">Loading local libraries…</p>
    <p v-else-if="error" class="banner error">{{ error }}</p>
    <p v-else-if="notice" class="banner ok">{{ notice }}</p>
    <p v-else-if="sources?.demo" class="banner">
      Demo mode — no local libraries found. Start Steam/Heroic sync or set STEAM_API_KEY + STEAM_ID.
    </p>
    <p v-else-if="sources" class="banner quiet">
      Steam: {{ sources.steam.mode }}
      <template v-if="sources.heroic.available"> · Heroic: {{ sources.heroic.count }} titles</template>
      <template v-if="!sources.steam.ownedConfigured">
        · add STEAM_API_KEY and STEAM_ID for the full Steam library
      </template>
    </p>

    <main>
      <div v-if="!loading && !filteredGames.length" class="empty">
        No games match this filter.
      </div>

      <div class="grid" :style="{ '--cols': gridColumns }">
        <GameCard
          v-for="(game, index) in filteredGames"
          :key="game.id"
          :game="game"
          :active="index === selectedIndex"
          @select="selectedIndex = index; openDetails()"
        />
      </div>
    </main>

    <GameDetails
      v-if="detailsOpen && selectedGame"
      :game="selectedGame"
      :busy="busy"
      @close="detailsOpen = false"
      @launch="launchSelected"
      @install="installSelected"
    />
  </div>
</template>
