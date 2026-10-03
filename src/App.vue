<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import FloatingParticles from "./components/FloatingParticles.vue";
import GameCard from "./components/GameCard.vue";
import GameShopSidebar from "./components/GameShopSidebar.vue";
import { useGamepad } from "./composables/useGamepad.js";
import { useLibrary } from "./composables/useLibrary.js";

const {
  filteredGames,
  stores,
  loading,
  error,
  notice,
  filter,
  query,
  sources,
  shopDetails,
  shopLoading,
  loadLibrary,
  loadShopDetails,
  actOnGame,
} = useLibrary();

const selectedIndex = ref(0);
const busy = ref(false);
const gridColumns = ref(3);

const codeRain = ref("");

const selectedGame = computed(
  () =>
    filteredGames.value[selectedIndex.value] || filteredGames.value[0] || null,
);

function buildCodeRain() {
  const glyphs = "$[]{}()<>=+*/\\|&%!?#@^~ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const lines = [];
  for (let row = 0; row < 18; row += 1) {
    let line = "";
    for (let col = 0; col < 48; col += 1) {
      line +=
        Math.random() > 0.72
          ? glyphs[Math.floor(Math.random() * glyphs.length)]
          : " ";
    }
    lines.push(line);
  }
  codeRain.value = lines.join("\n");
}

function measureColumns() {
  const width = window.innerWidth;
  if (width < 640) gridColumns.value = 1;
  else if (width < 980) gridColumns.value = 2;
  else if (width < 1400) gridColumns.value = 3;
  else gridColumns.value = 4;
}

function ensureSelection() {
  if (!filteredGames.value.length) {
    selectedIndex.value = 0;
    return;
  }
  if (selectedIndex.value > filteredGames.value.length - 1) {
    selectedIndex.value = filteredGames.value.length - 1;
  }
}

async function scrollSelectedIntoView() {
  await nextTick();
  document
    .querySelector(".card.active")
    ?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
}

function selectGame(index) {
  selectedIndex.value = index;
  scrollSelectedIntoView();
}

async function launchSelected() {
  if (!selectedGame.value?.canLaunch || busy.value) return;
  busy.value = true;
  try {
    await actOnGame(selectedGame.value, "launch");
  } finally {
    busy.value = false;
  }
}

async function installSelected() {
  if (!selectedGame.value?.canInstall || busy.value) return;
  busy.value = true;
  try {
    await actOnGame(selectedGame.value, "install");
  } finally {
    busy.value = false;
  }
}

const { connected, hint } = useGamepad({
  itemCount: () => filteredGames.value.length,
  columns: () => gridColumns.value,
  selectedIndex: () => selectedIndex.value,
  detailsOpen: () => false,
  onMove: (index) => selectGame(index),
  onConfirm: () => launchSelected(),
  onBack: () => {},
  onSecondary: () => {
    document
      .querySelector(".shop")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
  onInstall: () => installSelected(),
});

watch([filter, query, filteredGames], () => {
  ensureSelection();
});

watch(
  selectedGame,
  (game) => {
    loadShopDetails(game);
  },
  { immediate: true },
);

onMounted(async () => {
  buildCodeRain();
  measureColumns();
  window.addEventListener("resize", measureColumns);
  await loadLibrary();
  ensureSelection();
});
</script>

<template>
  <div class="shell">
    <FloatingParticles />
    <header class="topbar">
      <a
        class="logo-mark"
        href="https://lukaszkups.net"
        target="_blank"
        rel="noreferrer"
      >
        <span class="logo" aria-hidden="true"></span>
        <span class="logo-text">Kanapa Game Launcherrary</span>
      </a>
      <div class="topbar-meta">
        <span class="status" :class="{ on: connected }">
          {{ connected ? "Gamepad" : "Keyboard" }}
        </span>
      </div>
    </header>

    <section class="hero-band">
      <div class="code-rain" aria-hidden="true">{{ codeRain }}</div>
      <div class="hero-copy">
        <h1 class="skew-label">Library</h1>
        <p class="skew-text">
          Steam + Heroic on one couch UI. Move with a controller, check the shop
          panel, then launch or install through the real store apps.
        </p>
      </div>
      <aside class="hero-aside">
        <p class="label">Controls</p>
        <p class="hint">{{ hint }}</p>
      </aside>
    </section>

    <div class="content">
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
        Demo mode — no local libraries found. Start Steam/Heroic sync or set
        STEAM_API_KEY + STEAM_ID.
      </p>
      <p v-else-if="sources" class="banner quiet">
        Steam: {{ sources.steam.mode }}
        <template v-if="sources.heroic.available">
          · Heroic: {{ sources.heroic.count }} titles
        </template>
        <template v-if="!sources.steam.ownedConfigured">
          · add STEAM_API_KEY and STEAM_ID for the full Steam library
        </template>
      </p>

      <div class="workspace">
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
              @select="selectGame(index)"
            />
          </div>
        </main>

        <GameShopSidebar
          :game="selectedGame"
          :details="shopDetails"
          :loading="shopLoading"
          :busy="busy"
          @launch="launchSelected"
          @install="installSelected"
        />
      </div>
    </div>
  </div>
</template>
