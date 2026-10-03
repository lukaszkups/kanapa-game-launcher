<script setup>
import { computed, ref, watch } from "vue";
import { renderMarkdown } from "../utils/markdown.js";

const props = defineProps({
  game: { type: Object, default: null },
  details: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});

defineEmits(["launch", "install"]);

const activeShot = ref(0);

const shop = computed(() => props.details || props.game);
const screenshots = computed(() => shop.value?.screenshots || []);
const activeImage = computed(() => {
  const shots = screenshots.value;
  if (shots.length) {
    const shot = shots[Math.min(activeShot.value, shots.length - 1)];
    return shot.full || shot.thumbnail;
  }
  return shop.value?.hero || shop.value?.header || shop.value?.cover || "";
});

const descriptionHtml = computed(() => {
  if (props.loading && !props.details)
    return renderMarkdown("Loading shop details…");
  return renderMarkdown(shop.value?.description || "No description available.");
});

const longDescriptionHtml = computed(() => {
  const longText = props.details?.longDescription || "";
  if (!longText || longText === shop.value?.description) return "";
  return renderMarkdown(longText);
});

watch(
  () => props.game?.id,
  () => {
    activeShot.value = 0;
  },
);

function hours(minutes) {
  if (!minutes) return "—";
  return `${(minutes / 60).toFixed(1)} h`;
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
            activeImage ? { backgroundImage: `url(${activeImage})` } : undefined
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
          <span v-for="genre in shop.genres?.slice(0, 4) || []" :key="genre">{{
            genre
          }}</span>
          <span v-if="shop.releaseDate" class="muted">{{
            shop.releaseDate
          }}</span>
        </div>

        <div class="description markdown" v-html="descriptionHtml"></div>

        <div
          v-if="longDescriptionHtml"
          class="long markdown"
          v-html="longDescriptionHtml"
        ></div>

        <dl class="meta">
          <div>
            <dt>Status</dt>
            <dd>{{ shop.installed ? "Installed" : "Not installed" }}</dd>
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
  top: 0.75rem;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - 1.5rem));
  border: 1px solid var(--black);
  border-radius: 0;
  background: #111;
  overflow: hidden;
  box-shadow: 8px 8px 0 rgba(18, 18, 18, 0.12);
  animation: slide-in 220ms ease;
}

.shop * {
  color: var(--gold) !important;
}

.shop h2,
.shop a {
  color: #fff !important;
}

.shop button.primary {
  background-color: var(--gold) !important;
  color: #000 !important;
}

.shop .tags span {
  background-color: var(--gold) !important;
  color: #000 !important;
}

.empty {
  margin: auto;
  padding: 2rem;
  color: var(--blue);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.media {
  position: relative;
  flex: 0 0 auto;
  border-bottom: 1px solid var(--black);
}

.media.loading .hero {
  filter: grayscale(0.35);
}

.hero {
  min-height: 210px;
  background:
    linear-gradient(135deg, rgba(236, 189, 41, 0.35), rgba(28, 32, 41, 0.9)),
    var(--blue-dark);
  background-size: cover;
  background-position: center;
}

.thumbs {
  display: flex;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
  overflow-x: auto;
  background: var(--black);
}

.thumb {
  flex: 0 0 72px;
  width: 72px;
  height: 42px;
  border: 1px solid transparent;
  border-radius: 0;
  background-color: #1c2029;
  background-size: cover;
  background-position: center;
  cursor: pointer;
}

.thumb.active {
  border-color: var(--gold);
  box-shadow: 3px 3px 0 var(--gold);
}

.body {
  display: grid;
  gap: 0.75rem;
  padding: 1rem 1.1rem 1.2rem;
  overflow: auto;
  color: var(--black);
}

.store {
  margin: 0;
  color: var(--blue);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
}

h2 {
  margin: 0;
  font-family: "Bebas Neue", sans-serif;
  font-size: clamp(1.8rem, 2.4vw, 2.4rem);
  letter-spacing: 1px;
  line-height: 1;
  text-decoration: underline double var(--gold);
}

.byline,
.description,
.long {
  margin: 0;
  color: var(--blue-dark);
  line-height: 1.5;
}

.long {
  color: var(--blue);
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
  font-family: "Bebas Neue", sans-serif;
  font-size: 1.15rem;
  letter-spacing: 1px;
  line-height: 1.2;
  color: var(--black);
  text-decoration: underline double var(--gold);
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 1.2rem;
}

.markdown :deep(li) {
  margin: 0.2rem 0;
}

.markdown :deep(a) {
  color: var(--black);
  text-decoration-color: var(--gold);
}

.markdown :deep(code) {
  padding: 0.1rem 0.35rem;
  background: var(--blue-dark);
  color: #fff;
  font-size: 0.85em;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tags span {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--black);
  background: var(--white-alt);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tags .muted {
  background: #fff;
  color: var(--blue);
}

.meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  margin: 0.25rem 0 0;
}

.meta div {
  padding-top: 0.55rem;
  border-top: 1px solid var(--gray);
}

dt {
  color: var(--blue);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

dd {
  margin: 0.2rem 0 0;
  font-family: "Bebas Neue", sans-serif;
  letter-spacing: 1px;
  font-size: 1.1rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.25rem;
}

.primary,
.secondary,
.link {
  padding: 0.7rem 1rem;
  border-radius: 0;
  font-weight: 700;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.primary {
  border: 1px solid var(--black);
  background: var(--gold);
  color: var(--black);
  transform: skew(-8deg);
}

.primary:hover:not(:disabled) {
  background: var(--black);
  color: var(--gold);
}

.secondary {
  border: 1px solid var(--black);
  background: #fff;
  color: var(--black);
}

.secondary:hover:not(:disabled) {
  background: var(--black);
  color: #fff;
}

.link {
  border: 0;
  color: var(--black);
  background: transparent;
  text-decoration: underline double var(--gold);
  padding-left: 0.2rem;
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
  }
}
</style>
