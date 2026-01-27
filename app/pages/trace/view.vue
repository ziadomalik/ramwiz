<template>
  <div class="relative w-full h-screen flex flex-col overflow-hidden bg-neutral-900">
    <InfoBar 
      class="sticky top-0 z-10"
      :fps="stats.fps" 
      :event-count="stats.eventCount" 
      :total-events="stats.totalEvents"
      :current-lod="stats.currentLod"
    />
    <TraceViewTimeline 
      class="sticky top-0 z-10" 
      :view-state="viewState"
    />
    <div class="flex-1 min-h-0 overflow-hidden">
      <canvas ref="canvas" class="w-full h-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'trace',
});

const canvas = ref<HTMLCanvasElement | null>(null);
const { stats, viewState } = useRenderer(canvas);
</script>
