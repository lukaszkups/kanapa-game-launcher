<script setup>
defineProps({
  game: { type: Object, required: true },
  active: { type: Boolean, default: false },
})

defineEmits(['select'])

function coverStyle(game) {
  if (game.cover) {
    return {
      backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(8, 12, 16, 0.92)), url(${game.cover})`,
    }
  }

  return {
    backgroundImage:
      'linear-gradient(145deg, rgba(34, 163, 158, 0.35), rgba(8, 12, 16, 0.95)), radial-gradient(circle at 20% 20%, rgba(242, 169, 59, 0.28), transparent 45%)',
  }
}
</script>

<template>
  <button
    class="card"
    type="button"
    :class="{ active, installed: game.installed }"
    :style="coverStyle(game)"
    @click="$emit('select')"
  >
    <span class="store">{{ game.store }}</span>
    <span class="meta">
      <span class="title">{{ game.title }}</span>
      <span class="status">{{ game.installed ? 'Installed' : 'Not installed' }}</span>
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
  border: 1px solid rgba(232, 236, 239, 0.08);
  border-radius: 18px;
  background-color: #12181d;
  background-size: cover;
  background-position: center;
  color: #eef3f5;
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

.card:hover,
.card.active {
  transform: translateY(-4px) scale(1.015);
  border-color: rgba(54, 214, 196, 0.7);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

.card.active {
  outline: 2px solid #36d6c4;
  outline-offset: 3px;
}

.store {
  position: absolute;
  top: 0.85rem;
  left: 0.85rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(8, 12, 16, 0.72);
  color: #9ef0e4;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.meta {
  display: grid;
  gap: 0.25rem;
}

.title {
  font-family: 'Syne', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
}

.status {
  color: rgba(238, 243, 245, 0.72);
  font-size: 0.82rem;
}

.installed .status {
  color: #f2a93b;
}
</style>
