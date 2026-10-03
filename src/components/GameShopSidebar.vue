<script setup>
import { computed, ref, watch } from 'vue'
import { renderMarkdown } from '../utils/markdown.js'

const props = defineProps({
  game: { type: Object, default: null },
  details: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})

defineEmits(['launch', 'install'])

const activeShot = ref(0)

const shop = computed(() => props.details || props.game)
const screenshots = computed(() => shop.value?.screenshots || [])
const activeImage = computed(() => {
  const shots = screenshots.value
  if (shots.length) {
    const shot = shots[Math.min(activeShot.value, shots.length - 1)]
    return shot.full || shot.thumbnail
  }
  return shop.value?.hero || shop.value?.header || shop.value?.cover || ''
})

const descriptionHtml = computed(() => {
  if (props.loading && !props.details) return renderMarkdown('Loading shop details…')
  return renderMarkdown(shop.value?.description || 'No description available.')
})

const longDescriptionHtml = computed(() => {
  const longText = props.details?.longDescription || ''
  if (!longText || longText === shop.value?.description) return ''
  return renderMarkdown(longText)
})

watch(
  () => props.game?.id,
  () => {
    activeShot.value = 0
  },
)

function hours(minutes) {
  if (!minutes) return '—'
  return `${(minutes / 60).toFixed(1)} h`
}
</script>

<template>
  <aside class="shop" aria-label="Game shop page">
    <div v-if="!game" class="empty">Select a game to open its shop page.</div>

    <template v-else>
      <div class="media" :class="{ loading }">
        <div
          class="hero"
          :style="
            activeImage
              ? { backgroundImage: `url(${activeImage})` }
              : undefined
          "
        ></div>
        <div v-if="screenshots.length > 1" class="thumbs">
          <button
            v-for="(shot, index) in screenshots.slice(0, 8)"
            :key="shot.id || index"
            type="button"
            class="thumb"
            :class="{ active: index === activeShot }"
            :style="{ backgroundImage: `url(${shot.thumbnail || shot.full})` }"
            :aria-label="`Screenshot ${index + 1}`"
            @click="activeShot = index"
          ></button>
        </div>
      </div>

      <div class="body">
        <p class="store">{{ shop.store }} shop</p>
        <h2>{{ shop.title }}</h2>
        <p v-if="shop.developer || shop.publisher" class="byline">
          <span v-if="shop.developer">{{ shop.developer }}</span>
          <span v-if="shop.publisher"> · {{ shop.publisher }}</span>
        </p>

        <div class="tags" v-if="shop.genres?.length || shop.releaseDate">
          <span v-for="genre in shop.genres?.slice(0, 4) || []" :key="genre">{{ genre }}</span>
          <span v-if="shop.releaseDate" class="muted">{{ shop.releaseDate }}</span>
        </div>

        <div class="description markdown" v-html="descriptionHtml"></div>

        <div v-if="longDescriptionHtml" class="long markdown" v-html="longDescriptionHtml"></div>

        <dl class="meta">
          <div>
            <dt>Status</dt>
            <dd>{{ shop.installed ? 'Installed' : 'Not installed' }}</dd>
          </div>
          <div>
            <dt>Playtime</dt>
            <dd>{{ hours(shop.playtimeForever) }}</dd>
          </div>
          <div>
            <dt>Launcher</dt>
            <dd>{{ shop.runner }}</dd>
          </div>
        </dl>

        <div class="actions">
          <button
            class="primary"
            type="button"
            :disabled="busy || !shop.canLaunch"
            @click="$emit('launch')"
          >
            Launch
          </button>
          <button
            class="secondary"
            type="button"
            :disabled="busy || !shop.canInstall"
            @click="$emit('install')"
          >
            Install
          </button>
          <a
            v-if="shop.storeUrl"
            class="link"
            :href="shop.storeUrl"
            target="_blank"
            rel="noreferrer"
          >
            Open store page
          </a>
          <a
            v-if="shop.wikipediaUrl"
            class="link"
            :href="shop.wikipediaUrl"
            target="_blank"
            rel="noreferrer"
          >
            Wikipedia
          </a>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.shop {
  position: fixed;
  top: 1rem;
  right: 1rem;
  bottom: 1rem;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(380px, calc(100vw - 2rem));
  border: 1px solid rgba(238, 243, 245, 0.1);
  border-radius: 24px;
  background: rgba(10, 15, 19, 0.94);
  backdrop-filter: blur(12px);
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  animation: slide-in 220ms ease;
}

.empty {
  margin: auto;
  padding: 2rem;
  color: rgba(238, 243, 245, 0.6);
  text-align: center;
}

.media {
  position: relative;
  flex: 0 0 auto;
}

.media.loading .hero {
  filter: saturate(0.7);
}

.hero {
  min-height: 220px;
  background:
    radial-gradient(circle at 20% 20%, rgba(54, 214, 196, 0.22), transparent 40%),
    linear-gradient(135deg, #152028, #0b1217);
  background-size: cover;
  background-position: center;
}

.thumbs {
  display: flex;
  gap: 0.45rem;
  padding: 0.65rem 0.85rem;
  overflow-x: auto;
  background: linear-gradient(180deg, rgba(8, 12, 16, 0.2), rgba(8, 12, 16, 0.85));
}

.thumb {
  flex: 0 0 72px;
  width: 72px;
  height: 42px;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #12181d;
  background-size: cover;
  background-position: center;
  cursor: pointer;
}

.thumb.active {
  border-color: #36d6c4;
  box-shadow: 0 0 0 1px rgba(54, 214, 196, 0.35);
}

.body {
  display: grid;
  gap: 0.75rem;
  padding: 1rem 1.15rem 1.25rem;
  overflow: auto;
}

.store {
  margin: 0;
  color: #9ef0e4;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.5rem, 2vw, 2rem);
  line-height: 1.1;
}

.byline,
.description,
.long {
  margin: 0;
  color: rgba(238, 243, 245, 0.78);
  line-height: 1.5;
}

.long {
  color: rgba(238, 243, 245, 0.62);
  font-size: 0.92rem;
}

.markdown :deep(p),
.markdown :deep(ul),
.markdown :deep(ol),
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4) {
  margin: 0 0 0.65rem;
}

.markdown :deep(p:last-child),
.markdown :deep(ul:last-child),
.markdown :deep(ol:last-child),
.markdown :deep(h1:last-child),
.markdown :deep(h2:last-child),
.markdown :deep(h3:last-child),
.markdown :deep(h4:last-child) {
  margin-bottom: 0;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4) {
  font-family: 'Syne', sans-serif;
  font-size: 1rem;
  line-height: 1.25;
  color: #eef3f5;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 1.2rem;
}

.markdown :deep(li) {
  margin: 0.2rem 0;
}

.markdown :deep(a) {
  color: #9ef0e4;
}

.markdown :deep(code) {
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: rgba(238, 243, 245, 0.08);
  font-size: 0.9em;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tags span {
  padding: 0.25rem 0.55rem;
  border: 1px solid rgba(238, 243, 245, 0.12);
  border-radius: 999px;
  font-size: 0.75rem;
  color: rgba(238, 243, 245, 0.8);
}

.tags .muted {
  color: rgba(238, 243, 245, 0.55);
}

.meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  margin: 0.25rem 0 0;
}

.meta div {
  padding-top: 0.55rem;
  border-top: 1px solid rgba(238, 243, 245, 0.1);
}

dt {
  color: rgba(238, 243, 245, 0.5);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

dd {
  margin: 0.2rem 0 0;
  font-family: 'Syne', sans-serif;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  margin-top: 0.25rem;
}

.primary,
.secondary,
.link {
  padding: 0.75rem 1.05rem;
  border-radius: 999px;
  font-weight: 700;
  text-decoration: none;
}

.primary {
  border: 0;
  background: #36d6c4;
  color: #07201d;
}

.secondary {
  border: 1px solid rgba(238, 243, 245, 0.28);
  background: transparent;
  color: #eef3f5;
}

.link {
  border: 0;
  color: #9ef0e4;
  background: transparent;
  padding-left: 0.35rem;
}

.primary:disabled,
.secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 980px) {
  .shop {
    width: min(340px, calc(100vw - 1.25rem));
    top: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
  }
}
</style>
