<template>
  <div class="canvas-container">
    <canvas ref="canvas" width="800" height="600" />
  </div>
</template>

<script setup lang="ts">
const canvas = ref<HTMLCanvasElement | null>(null);
useRenderer(canvas);
</script>

<style scoped>
.canvas-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}
canvas {
  max-width: 100%;
}
</style>