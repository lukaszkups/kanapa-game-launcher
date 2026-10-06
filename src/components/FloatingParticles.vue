<script setup>
import { nextTick, onMounted, onUnmounted } from "vue";
import partikle from "partikle";

const NODE_ID = "particle-canvas";

let started = false;
let retryId = 0;
let resizeObserver = null;

function getNode() {
  return document.getElementById(NODE_ID);
}

function nodeReady(node) {
  return Boolean(node && node.clientWidth > 0 && node.clientHeight > 0);
}

function startPartikle() {
  // partikle has no destroy API — calling it again stacks orphan RAF loops
  // and resize listeners that keep clearing detached canvases.
  if (started) return true;

  const node = getNode();
  if (!nodeReady(node)) return false;

  partikle({
    nodeId: NODE_ID,
    particleColor: "#2f3646",
    particlesAmount: 500,
    maxFPS: 60,
  });

  started = true;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  return true;
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

    // Desktop can mount before the viewport has a non-zero size.
    resizeObserver = new ResizeObserver(() => {
      startPartikle();
    });
    resizeObserver.observe(node);
  }
});

onUnmounted(() => {
  if (retryId) clearTimeout(retryId);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  const node = getNode();
  if (node) node.replaceChildren();
  started = false;
});
</script>

<template>
  <div class="particle-canvas-wrapper" aria-hidden="true">
    <div :id="NODE_ID" class="particle-canvas"></div>
  </div>
</template>

<style scoped>
.particle-canvas-wrapper {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  pointer-events: none;
}

.particle-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
