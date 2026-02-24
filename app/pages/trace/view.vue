<template>
  <div class="relative w-full h-screen flex flex-col overflow-hidden bg-neutral-900">
    <InfoBar 
      class="sticky top-0 z-10"
      :fps="stats.fps" 
      :event-count="stats.eventCount" 
      :total-events="stats.totalEvents"
      :current-lod="stats.currentLod"
    />
    <DevOnly>
      <DevInfoBar
        :hovered-event="hoveredEvent"
      />
    </DevOnly>
    <TraceViewTimeline 
      class="sticky top-0 z-10" 
      :view-state="viewState"
    />
    <div class="flex-1 min-h-0 overflow-hidden">
      <canvas ref="canvas" class="w-full h-full" />
    </div>
        
    <div 
      v-if="hoveredEvent"
      class="fixed z-50 bg-zinc-800 p-2 rounded shadow-lg pointer-events-none text-sm text-zinc-200"
      :style="{ left: (mouseX + 12) + 'px', top: (mouseY + 12) + 'px' }"
    >
      <p>Command: {{ hoveredEvent.cmdId }}</p>
      <p>Start: {{ hoveredEvent.start.toFixed(2) }}</p>
      <p>Duration: {{ hoveredEvent.duration }}</p>
      <p>Ch: {{ hoveredEvent.channel }} BG: {{ hoveredEvent.bankgroup }} Bank: {{ hoveredEvent.bank }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'trace',
});

const canvas = ref<HTMLCanvasElement | null>(null);
const { stats, viewState, hoveredEvent, mouseX, mouseY } = useRenderer(canvas);
</script>
