<script setup>
defineProps({
  game: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})

defineEmits(['close', 'launch', 'install'])

function hours(minutes) {
  if (!minutes) return '—'
  return `${(minutes / 60).toFixed(1)} h`
}

function heroStyle(game) {
  const image = game.hero || game.header || game.cover
  if (!image) {
    return {
      backgroundImage:
        'linear-gradient(120deg, rgba(18, 24, 29, 0.2), rgba(8, 12, 16, 0.92)), radial-gradient(circle at 80% 20%, rgba(54, 214, 196, 0.28), transparent 40%)',
    }
  }
  return {
    backgroundImage: `linear-gradient(90deg, rgba(8, 12, 16, 0.92) 18%, rgba(8, 12, 16, 0.55) 55%, rgba(8, 12, 16, 0.9)), url(${image})`,
  }
}
</script>

<template>
  <div class="details" role="dialog" aria-modal="true">
    <div class="panel" :style="heroStyle(game)">
      <button class="close" type="button" @click="$emit('close')">Back</button>

      <div class="content">
        <p class="eyebrow">{{ game.store }} · {{ game.installed ? 'ready' : 'library' }}</p>
        <h2>{{ game.title }}</h2>
        <p class="developer" v-if="game.developer">{{ game.developer }}</p>
        <p class="description">{{ game.description }}</p>

        <dl class="stats">
          <div>
            <dt>Playtime</dt>
            <dd>{{ hours(game.playtimeForever) }}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{{ game.installed ? 'Installed' : 'Not installed' }}</dd>
          </div>
          <div>
            <dt>Launcher</dt>
            <dd>{{ game.runner }}</dd>
          </div>
        </dl>

        <div class="actions">
          <button
            class="primary"
            type="button"
            :disabled="busy || !game.canLaunch"
            @click="$emit('launch')"
          >
            Launch
          </button>
          <button
            class="secondary"
            type="button"
            :disabled="busy || !game.canInstall"
            @click="$emit('install')"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.details {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(5, 8, 10, 0.72);
  backdrop-filter: blur(10px);
  animation: fade-in 180ms ease;
}

.panel {
  position: relative;
  width: min(960px, 100%);
  min-height: 420px;
  border: 1px solid rgba(232, 236, 239, 0.1);
  border-radius: 28px;
  background-color: #0d1318;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  animation: rise 220ms ease;
}

.close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(238, 243, 245, 0.16);
  border-radius: 999px;
  background: rgba(8, 12, 16, 0.7);
  color: #eef3f5;
}

.content {
  display: grid;
  gap: 0.85rem;
  max-width: 34rem;
  padding: 3.5rem 2.5rem 2.5rem;
}

.eyebrow {
  margin: 0;
  color: #9ef0e4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.75rem;
}

h2 {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1.05;
}

.developer,
.description {
  margin: 0;
  color: rgba(238, 243, 245, 0.82);
}

.description {
  max-width: 38ch;
  line-height: 1.55;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0.5rem 0 0;
}

.stats div {
  padding: 0.75rem 0 0;
  border-top: 1px solid rgba(238, 243, 245, 0.12);
}

dt {
  color: rgba(238, 243, 245, 0.55);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

dd {
  margin: 0.25rem 0 0;
  font-family: 'Syne', sans-serif;
  font-size: 1.05rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.primary,
.secondary {
  padding: 0.85rem 1.25rem;
  border-radius: 999px;
  border: 0;
  font-weight: 700;
}

.primary {
  background: #36d6c4;
  color: #07201d;
}

.secondary {
  background: transparent;
  color: #eef3f5;
  border: 1px solid rgba(238, 243, 245, 0.28);
}

.primary:disabled,
.secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 720px) {
  .content {
    padding: 4rem 1.25rem 1.5rem;
  }

  .stats {
    grid-template-columns: 1fr;
  }
}
</style>
