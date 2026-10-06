<script setup>
import { nextTick, onMounted, onUnmounted } from "vue";
import partikle from "partikle";

const NODE_ID = "particle-canvas";

let started = false;
let retryId = 0;
let resizeTimer = 0;
let lastWidth = 0;
let lastHeight = 0;
let resizeObserver = null;

function getNode() {
  return document.getElementById(NODE_ID);
}

function nodeReady(node) {
  return Boolean(node && node.clientWidth > 0 && node.clientHeight > 0);
}

function clearPartikle(node) {
  if (!node) return;
  node.replaceChildren();
}

function startPartikle({ force = false } = {}) {
  const node = getNode();
  if (!nodeReady(node)) return false;

  const width = node.clientWidth;
  const height = node.clientHeight;
  if (!force && started && width === lastWidth && height === lastHeight) {
    return true;
  }

  node.style.width = "100%";
  node.style.height = "100%";

  // Partikle has no destroy API — clear old canvases, then create a fresh one.
  clearPartikle(node);

  partikle({
    nodeId: NODE_ID,
    particleColor: "#2f3646",
    particlesAmount: 500,
    maxFPS: 60,
  });

  started = true;
  lastWidth = width;
  lastHeight = height;
  return true;
}

function scheduleRestart() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = 0;
    startPartikle({ force: true });
  }, 150);
}

onMounted(async () => {
  await nextTick();
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  const node = getNode();
  if (!node) return;

  if (!startPartikle()) {
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      if (startPartikle() || attempts > 40) return;
      retryId = window.setTimeout(retry, 50);
    };
    retryId = window.setTimeout(retry, 50);
  }

  resizeObserver = new ResizeObserver(() => {
    if (!started) {
      startPartikle();
      return;
    }
    scheduleRestart();
  });
  resizeObserver.observe(node);
  if (node.parentElement) resizeObserver.observe(node.parentElement);

  window.addEventListener("resize", scheduleRestart);
});

onUnmounted(() => {
  if (retryId) clearTimeout(retryId);
  if (resizeTimer) clearTimeout(resizeTimer);
  window.removeEventListener("resize", scheduleRestart);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  clearPartikle(getNode());
});
</script>

<template>
  <div class="particle-canvas-wrapper" aria-hidden="true">
    <div :id="NODE_ID" class="particle-canvas"></div>
  </div>
</template>

<style scoped>
.particle-canvas-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  pointer-events: none;
}

.particle-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
}
</style>
