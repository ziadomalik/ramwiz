<template>
  <div class="relative w-full h-screen flex flex-col overflow-hidden bg-neutral-900">
    <div class="flex-1 min-h-0 overflow-hidden">
      <canvas ref="canvas" class="w-full h-full" />
    </div>
    <InfoBar 
      class="fixed bottom-0 z-10"
      :fps="stats.fps" 
      :event-count="stats.eventCount" 
      :total-events="stats.totalEvents"
    />
  </div>
</template>

<script setup lang="ts">
const canvas = ref<HTMLCanvasElement | null>(null);
const { stats } = useRenderer(canvas);
</script>
