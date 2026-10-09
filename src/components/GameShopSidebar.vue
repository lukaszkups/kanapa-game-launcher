<script setup>
import { computed, nextTick, ref, watch } from "vue";
import ActionGlyph from "./ActionGlyph.vue";
import { renderMarkdown } from "../utils/markdown.js";

const props = defineProps({
  game: { type: Object, default: null },
  details: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  notice: { type: String, default: "" },
  pendingAction: { type: String, default: "" }, // 'install' | 'uninstall' | ''
  connected: { type: Boolean, default: false },
});

defineEmits(["launch", "install", "uninstall"]);

const activeShot = ref(0);
const bodyRef = ref(null);
const thumbsRef = ref(null);

const shop = computed(() => ({
  ...(props.game || {}),
  ...(props.details || {}),
  // Action flags must come from the library entry, not enriched shop details.
  canInstall: Boolean(props.game?.canInstall),
  canLaunch: Boolean(props.game?.canLaunch),
  canUninstall: Boolean(props.game?.canUninstall),
  installed: Boolean(props.game?.installed),
}));

const statusLabel = computed(() => {
  if (props.pendingAction === "install") return "Installing…";
  if (props.pendingAction === "uninstall") return "Uninstalling…";
  return shop.value.installed ? "Installed" : "Not installed";
});

const actionNotice = computed(() => {
  if (props.pendingAction === "install") {
    return props.notice || "Started install";
  }
  if (props.pendingAction === "uninstall") {
    return props.notice || "Started uninstall";
  }
  return "";
});
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

async function cycleScreenshot(delta) {
  const count = screenshots.value.length;
  if (!count) return;
  activeShot.value = (activeShot.value + delta + count) % count;
  await nextTick();
  thumbsRef.value?.querySelector(".thumb.active")?.scrollIntoView({
    inline: "nearest",
    block: "nearest",
    behavior: "smooth",
  });
}

function scrollBody(deltaY) {
  if (!bodyRef.value || !deltaY) return;
  bodyRef.value.scrollTop += deltaY;
}

function scrollThumbs(deltaX) {
  if (!thumbsRef.value || !deltaX) return;
  thumbsRef.value.scrollLeft += deltaX;
}

defineExpose({
  cycleScreenshot,
  scrollBody,
  scrollThumbs,
});
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
        <div v-if="screenshots.length > 1" ref="thumbsRef" class="thumbs">
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

      <div ref="bodyRef" class="body">
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
            <dd :class="{ pending: pendingAction }">{{ statusLabel }}</dd>
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

        <p
          v-if="actionNotice"
          class="action-notice"
          :class="{ pending: pendingAction }"
        >
          {{ actionNotice }}
        </p>

        <div class="actions">
          <button
            class="primary has-glyph"
            type="button"
            :disabled="busy || !!pendingAction || !shop.canLaunch"
            @click="$emit('launch')"
          >
            <ActionGlyph pad="A" key-label="⏎" :connected="connected" />
            Launch
          </button>
          <button
            class="secondary has-glyph"
            type="button"
            :disabled="
              busy ||
              !!pendingAction ||
              (shop.installed ? !shop.canUninstall : !shop.canInstall)
            "
            @click="shop.installed ? $emit('uninstall') : $emit('install')"
          >
            <ActionGlyph pad="Y" key-label="I" :connected="connected" />
            {{
              pendingAction === "install"
                ? "Installing…"
                : pendingAction === "uninstall"
                  ? "Uninstalling…"
                  : shop.installed
                    ? "Uninstall"
                    : "Install"
            }}
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

.shop button.primary :deep(.glyph),
.shop button.secondary :deep(.glyph) {
  color: #fff !important;
  border-color: #fff;
  background: rgba(0, 0, 0, 0.85);
}

.shop button.primary.has-glyph :deep(.glyph) {
  transform: skew(8deg);
}

.shop button.secondary {
  border: 2px dashed var(--gold) !important;
  background: transparent !important;
  color: var(--gold) !important;
}

.shop button.secondary:hover {
  border-color: #fff !important;
  color: #fff !important;
}

button:hover {
  cursor: pointer;
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
    linear-gradient(135deg, rgba(var(--accent-rgb), 0.35), rgba(28, 32, 41, 0.9)),
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
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--accent-rgb), 0.45) transparent;
}

.thumbs::-webkit-scrollbar {
  height: 6px;
}

.thumbs::-webkit-scrollbar-track {
  background: transparent;
}

.thumbs::-webkit-scrollbar-thumb {
  background: rgba(var(--accent-rgb), 0.45);
  border-radius: 0;
}

.thumbs::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--accent-rgb), 0.7);
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
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--black);
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--accent-rgb), 0.45) rgba(255, 255, 255, 0.04);
}

.body::-webkit-scrollbar {
  width: 8px;
}

.body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-left: 1px solid rgba(var(--accent-rgb), 0.12);
}

.body::-webkit-scrollbar-thumb {
  background: rgba(var(--accent-rgb), 0.45);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.body::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--accent-rgb), 0.7);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.body::-webkit-scrollbar-corner {
  background: transparent;
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
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.byline,
.description,
.long {
  margin: 0;
  color: var(--blue-dark);
  line-height: 1.5;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
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
.markdown :deep(h4),
.markdown :deep(pre),
.markdown :deep(blockquote),
.markdown :deep(table) {
  margin: 0 0 0.65rem;
  max-width: 100%;
}

.markdown :deep(img),
.markdown :deep(video) {
  display: block;
  max-width: 100%;
  height: auto;
}

.markdown :deep(pre),
.markdown :deep(code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
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

dd.pending {
  color: var(--gold);
}

.action-notice {
  margin: 0.35rem 0 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(var(--accent-rgb), 0.45);
  background: rgba(var(--accent-rgb), 0.12);
  color: #1a1a1a;
  font-size: 0.86rem;
  line-height: 1.35;
}

.action-notice.pending {
  border-color: rgba(var(--accent-rgb), 0.7);
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
  position: relative;
  padding: 0.7rem 1.35rem 0.7rem 1rem;
  border-radius: 0;
  font-weight: 700;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.has-glyph {
  padding-right: 1.55rem;
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
