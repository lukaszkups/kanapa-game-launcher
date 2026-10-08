<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import FloatingParticles from "./components/FloatingParticles.vue";
import ActionGlyph from "./components/ActionGlyph.vue";
import GameCard from "./components/GameCard.vue";
import GameShopSidebar from "./components/GameShopSidebar.vue";
import SettingsModal from "./components/SettingsModal.vue";
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
  refreshGame,
  refreshGameUntil,
  loadShopDetails,
  actOnGame,
} = useLibrary();

const selectedIndex = ref(0);
const busy = ref(false);
const gridColumns = ref(3);
const shopRef = ref(null);
const pendingActionById = ref({});
const showBackToTop = ref(false);
const settingsOpen = ref(false);
const gameRunning = ref(false);
let sessionPollTimer = 0;

const pendingAction = computed(() => {
  const id = selectedGame.value?.id;
  if (!id) return "";
  return pendingActionById.value[id] || "";
});

function openSettings() {
  settingsOpen.value = true;
}

async function onSettingsSaved() {
  notice.value = "Steam settings saved — refreshing library";
  await loadLibrary();
  ensureSelection();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function onWindowScroll() {
  showBackToTop.value = window.scrollY > 420;
}
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
  document.querySelector(".card.active")?.scrollIntoView({
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
  if (busy.value) return;
  if (!selectedGame.value) return;
  if (!selectedGame.value.canInstall) {
    notice.value = `${selectedGame.value.title} is already installed`;
    return;
  }
  const gameId = selectedGame.value.id;
  pendingActionById.value = {
    ...pendingActionById.value,
    [gameId]: "install",
  };
  notice.value = `Started install for ${selectedGame.value.title}`;
  busy.value = true;
  try {
    const payload = await actOnGame(selectedGame.value, "install");
    notice.value =
      payload?.message || `Started install for ${selectedGame.value.title}`;
  } catch {
    const next = { ...pendingActionById.value };
    delete next[gameId];
    pendingActionById.value = next;
  } finally {
    busy.value = false;
  }
  // Patch only this entry as install finishes — keep scroll/selection.
  void refreshGameUntil(gameId, (game) => game.installed, {
    attempts: 12,
    delayMs: 2000,
  }).then((updated) => {
    if (updated?.installed) {
      const next = { ...pendingActionById.value };
      delete next[gameId];
      pendingActionById.value = next;
      notice.value = `${updated.title} is installed`;
    }
  });
}

async function uninstallSelected() {
  if (busy.value) return;
  if (!selectedGame.value) return;
  if (!selectedGame.value.canUninstall) {
    notice.value = `${selectedGame.value.title} cannot be uninstalled from here`;
    return;
  }
  const gameId = selectedGame.value.id;
  pendingActionById.value = {
    ...pendingActionById.value,
    [gameId]: "uninstall",
  };
  notice.value = `Started uninstall for ${selectedGame.value.title}`;
  busy.value = true;
  try {
    const payload = await actOnGame(selectedGame.value, "uninstall");
    notice.value =
      payload?.message || `Started uninstall for ${selectedGame.value.title}`;
  } catch {
    const next = { ...pendingActionById.value };
    delete next[gameId];
    pendingActionById.value = next;
  } finally {
    busy.value = false;
  }
  void refreshGameUntil(gameId, (game) => !game.installed, {
    attempts: 10,
    delayMs: 1500,
  }).then((updated) => {
    if (updated && !updated.installed) {
      const next = { ...pendingActionById.value };
      delete next[gameId];
      pendingActionById.value = next;
      notice.value = `${updated.title} was uninstalled`;
    }
  });
}

async function installOrUninstallSelected() {
  if (selectedGame.value?.installed) {
    await uninstallSelected();
  } else {
    await installSelected();
  }
}

const filterTabs = computed(() => [
  "all",
  "installed",
  ...stores.value.map((store) => store.id),
]);

function cycleFilter(delta) {
  const tabs = filterTabs.value;
  if (!tabs.length) return;
  const current = Math.max(0, tabs.indexOf(filter.value));
  const next = (current + delta + tabs.length) % tabs.length;
  filter.value = tabs[next];
  selectedIndex.value = 0;
  scrollSelectedIntoView();
}

const { connected, hint } = useGamepad({
  itemCount: () => filteredGames.value.length,
  columns: () => gridColumns.value,
  selectedIndex: () => selectedIndex.value,
  detailsOpen: () => false,
  enabled: () => !settingsOpen.value && !gameRunning.value,
  onMove: (index) => selectGame(index),
  onConfirm: () => launchSelected(),
  onBack: () => {},
  onSecondary: () => {
    document
      .querySelector(".shop")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
  onInstall: () => installOrUninstallSelected(),
  onFilterPrev: () => cycleFilter(-1),
  onFilterNext: () => cycleFilter(1),
  onScreenshot: (delta) => shopRef.value?.cycleScreenshot(delta),
  onShopScroll: (deltaY) => shopRef.value?.scrollBody(deltaY),
  onShopThumbsScroll: (deltaX) => shopRef.value?.scrollThumbs(deltaX),
});

async function pollGameSession() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) return;
    const payload = await response.json();
    gameRunning.value = Boolean(payload.gameRunning);
  } catch {
    // Bridge may be briefly unavailable during restarts.
  }
}

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
  window.addEventListener("scroll", onWindowScroll, { passive: true });
  onWindowScroll();
  void pollGameSession();
  sessionPollTimer = window.setInterval(() => {
    void pollGameSession();
  }, 1000);
  await loadLibrary();
  ensureSelection();
});

onUnmounted(() => {
  window.removeEventListener("resize", measureColumns);
  window.removeEventListener("scroll", onWindowScroll);
  if (sessionPollTimer) clearInterval(sessionPollTimer);
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
        <svg
          class="logo"
          viewBox="0 0 40 28"
          aria-hidden="true"
          focusable="false"
        >
          <!-- couch backrest -->
          <rect x="6" y="2" width="28" height="10" rx="2" fill="currentColor" />
          <!-- armrests -->
          <rect x="1" y="10" width="6" height="12" rx="2" fill="currentColor" />
          <rect x="33" y="10" width="6" height="12" rx="2" fill="currentColor" />
          <!-- seat -->
          <rect x="7" y="11" width="26" height="11" rx="1.5" fill="currentColor" />
          <!-- cushion split -->
          <rect x="19.25" y="12" width="1.5" height="9" fill="var(--blue-dark)" />
          <!-- d-pad (left cushion) -->
          <rect x="11.5" y="14.5" width="5" height="1.6" fill="var(--gold)" />
          <rect x="13.2" y="12.8" width="1.6" height="5" fill="var(--gold)" />
          <!-- face buttons (right cushion) -->
          <circle cx="25.2" cy="15.2" r="1.15" fill="var(--gold)" />
          <circle cx="28.2" cy="15.2" r="1.15" fill="var(--gold)" />
          <circle cx="25.2" cy="18.2" r="1.15" fill="var(--gold)" />
          <circle cx="28.2" cy="18.2" r="1.15" fill="var(--gold)" />
          <!-- legs -->
          <rect x="5" y="22" width="2.2" height="4" fill="currentColor" />
          <rect x="32.8" y="22" width="2.2" height="4" fill="currentColor" />
        </svg>
        <span class="logo-text">Kanapa Game Launcher</span>
      </a>
      <div class="topbar-meta">
        <button type="button" class="settings-btn" @click="openSettings">
          Settings
        </button>
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
          <span class="filter-glyph start" aria-hidden="true">
            <ActionGlyph pad="LB" key-label="[" :connected="connected" />
          </span>
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
          <span class="filter-glyph end" aria-hidden="true">
            <ActionGlyph pad="RB" key-label="]" :connected="connected" />
          </span>
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
        Demo mode — no local libraries found. Start Steam/Heroic sync or open
        Settings to add a Steam API key + Steam ID.
      </p>
      <p v-else-if="sources" class="banner quiet">
        Steam: {{ sources.steam.mode }}
        <template v-if="sources.heroic.available">
          · Heroic: {{ sources.heroic.count }} titles
        </template>
        <template v-if="sources.prism?.available">
          · Prism: {{ sources.prism.count }} instances
        </template>
        <template v-if="!sources.steam.ownedConfigured">
          ·
          <button type="button" class="inline-link" @click="openSettings">
            add Steam API key + Steam ID
          </button>
          for the full library
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
          ref="shopRef"
          :game="selectedGame"
          :details="shopDetails"
          :loading="shopLoading"
          :busy="busy"
          :notice="notice"
          :pending-action="pendingAction"
          :connected="connected"
          @launch="launchSelected"
          @install="installSelected"
          @uninstall="uninstallSelected"
        />
      </div>
    </div>

    <button
      type="button"
      class="back-to-top has-glyph"
      :class="{ visible: showBackToTop }"
      aria-label="Back to top"
      @click="scrollToTop"
    >
      <ActionGlyph pad="↑" key-label="↑" :connected="connected" />
      <span>Back to top</span>
    </button>

    <SettingsModal
      :open="settingsOpen"
      @close="settingsOpen = false"
      @saved="onSettingsSaved"
    />
  </div>
</template>
