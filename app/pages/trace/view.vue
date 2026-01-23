<template>
  <div class="relative w-full h-screen flex flex-col overflow-hidden">
    <div class="flex-1 min-h-0 overflow-hidden bg-[#111]">
      <canvas ref="canvas" class="w-full h-full" />
    </div>
    <InfoBar 
      class="fixed bottom-0 z-10"
      :fps="stats.fps" 
      :event-count="stats.eventCount" 
    />
  </div>
</template>

<script setup lang="ts">
const canvas = ref<HTMLCanvasElement | null>(null);
const { stats } = useRenderer(canvas);
</script>
