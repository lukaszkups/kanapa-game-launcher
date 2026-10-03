<script setup>
import { nextTick, onMounted } from 'vue'
import partikle from 'partikle'

const NODE_ID = 'particle-canvas'

onMounted(async () => {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const node = document.getElementById(NODE_ID)
  if (!node) return

  node.style.width = '100%'
  node.style.height = '100%'

  // Match lukaszkups.net/experience particle settings.
  partikle({
    nodeId: NODE_ID,
    particleColor: '#2f3646',
    particlesAmount: 500,
    maxFPS: 60,
  })
})
</script>

<template>
  <div class="particle-canvas-wrapper" aria-hidden="true">
    <div :id="NODE_ID" class="particle-canvas"></div>
  </div>
</template>

<style scoped>
/* Same idea as #particles-js--exp on lukaszkups.net/experience:
   absolute full-bleed layer under content (z-index: 1), UI stays above. */
.particle-canvas-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
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
