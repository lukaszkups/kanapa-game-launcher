<script setup>
defineProps({
  pad: { type: String, default: "" },
  keyLabel: { type: String, default: "" },
  connected: { type: Boolean, default: false },
});
</script>

<template>
  <span class="glyph" :title="connected ? `Gamepad ${pad}` : `Key ${keyLabel}`">
    {{ connected ? pad : keyLabel }}
  </span>
</template>

<style scoped>
.glyph {
  position: absolute;
  top: 0.2rem;
  right: 0.25rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.05rem;
  height: 1.05rem;
  padding: 0 0.2rem;
  border: 1px solid currentColor;
  background: rgba(0, 0, 0, 0.75);
  color: #fff !important;
  font-family: "Roboto Condensed", sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  text-transform: uppercase;
  pointer-events: none;
  transform: none !important;
}
</style>
