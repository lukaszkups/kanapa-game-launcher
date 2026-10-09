<script setup>
import { onMounted, ref, watch } from "vue";

const props = defineProps({
  game: { type: Object, required: true },
  active: { type: Boolean, default: false },
});

defineEmits(["select"]);

const coverUrl = ref("");

function candidatesFor(game) {
  return [
    game?.cover,
    ...(game?.coverFallbacks || []),
    game?.header,
    game?.hero,
  ].filter(Boolean);
}

function probeCover(game) {
  const queue = [...new Set(candidatesFor(game))];
  if (!queue.length) {
    coverUrl.value = "";
    return;
  }

  let index = 0;
  const tryNext = () => {
    if (index >= queue.length) {
      coverUrl.value = "";
      return;
    }
    const url = queue[index++];
    const img = new Image();
    img.onload = () => {
      coverUrl.value = url;
    };
    img.onerror = () => tryNext();
    img.src = url;
  };
  tryNext();
}

watch(
  () => props.game?.id,
  () => probeCover(props.game),
  { immediate: true },
);

onMounted(() => probeCover(props.game));

function coverStyle() {
  if (!coverUrl.value) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(18, 18, 18, 0.92)), url("${coverUrl.value}")`,
  };
}
</script>

<template>
  <button
    class="card"
    type="button"
    :class="{ active, installed: game.installed, 'no-cover': !coverUrl }"
    :style="coverStyle()"
    @click="$emit('select')"
  >
    <span class="store">{{ game.store }}</span>
    <span class="meta">
      <span class="title">{{ game.title }}</span>
      <span class="status">{{
        game.installed ? "Installed" : "Not installed"
      }}</span>
    </span>
  </button>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 240px;
  padding: 1rem;
  border: 1px solid #e2e2e2;
  border-radius: 0;
  background-color: #121212;
  background-size: cover;
  background-position: center;
  color: #fff;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  content-visibility: auto;
  contain-intrinsic-size: 240px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.card.no-cover {
  background-image:
    linear-gradient(
      145deg,
      rgba(var(--accent-rgb), 0.35),
      rgba(18, 18, 18, 0.95)
    ),
    radial-gradient(
      circle at 20% 20%,
      rgba(55, 59, 68, 0.45),
      transparent 45%
    );
}

.card:hover,
.card.active {
  transform: translateY(-3px);
  border-color: var(--gold);
  box-shadow: 0 8px 24px rgba(18, 18, 18, 0.12);
}

.card.active {
  outline: 3px solid var(--gold);
  outline-offset: 2px;
}

.store {
  position: absolute;
  top: 0.85rem;
  left: 0.85rem;
  padding: 0.2rem 0.55rem;
  background: var(--black);
  color: var(--gold);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transform: skew(-10deg);
}

.meta {
  display: grid;
  gap: 0.25rem;
}

.title {
  font-family: "Bebas Neue", sans-serif;
  font-size: 1.35rem;
  letter-spacing: 1px;
  line-height: 1.1;
}

.status {
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.installed .status {
  color: var(--gold);
}
</style>
