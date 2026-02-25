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
      <canvas ref="canvas" class="w-full h-full cursor-crosshair" />
    </div>
  </div>
  <div 
    v-if="hoveredEvent"
    ref="tooltip"
    class="fixed z-50 bg-zinc-800/95 backdrop-blur-sm px-3 py-2.5 rounded-lg shadow-xl border border-zinc-700/50 pointer-events-none text-zinc-200"
    :style="tooltipStyle"
  >
    <!-- Header -->
    <div class="flex items-center gap-2">
      <div :style="{ backgroundColor: sessionStore.commandConfig?.colors[hoveredEvent.cmdId] }" class="size-3 rounded shrink-0" />
      <span class="font-semibold text-sm">{{ name }}</span>
      <span class="text-zinc-500 text-xs font-mono">{{ hoveredEvent.duration }} clk</span>
    </div>

    <div class="border-t border-zinc-700/50 my-2" />

    <!-- Start time -->
    <p class="text-xs font-mono text-zinc-400 mb-2">t = {{ hoveredEvent.start }} clk</p>

    <!-- Address -->
    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono w-full">
      <span><span class="text-zinc-500">CH</span> {{ hoveredEvent.channel }}</span>
      <span><span class="text-zinc-500">RA</span> {{ hoveredEvent.rank }}</span>
      <span><span class="text-zinc-500">BG</span> {{ hoveredEvent.bankgroup }}</span>
      <span><span class="text-zinc-500">BNK</span> {{ hoveredEvent.bank }}</span>
      <span><span class="text-zinc-500">ROW</span> {{ hoveredEvent.row }}</span>
      <span><span class="text-zinc-500">COL</span> {{ hoveredEvent.column }}</span>
    </div>

    <template v-if="hoveredEvent.violation">
      <div class="border-t border-red-700/40 my-2" />
      <div class="flex items-center gap-1.5 mb-1">
        <UIcon name="i-lucide-circle-alert" class="text-red-400" />
        <span class="text-red-400 text-xs font-semibold">Timing Violation</span>
      </div>
      <ul class="text-[11px] text-red-300/80 space-y-0.5 pl-3.5 list-disc">
        <li v-for="reason in hoveredEvent.violationReasons" :key="reason">{{ reason }}</li>
      </ul>
    </template>
  </div>
  <ViolationNavigator :violations="stats.violationCount" v-if="stats.violationCount > 0" @prev="goToPrevViolation" @next="goToNextViolation" />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'trace',
});

const sessionStore = useSessionStore();

const name = computed(() => sessionStore.getCommandName(hoveredEvent.value?.cmdId ?? 0));

const canvas = ref<HTMLCanvasElement | null>(null);
const tooltip = ref<HTMLDivElement | null>(null);
const { stats, viewState, hoveredEvent, mouseX, mouseY, goToNextViolation, goToPrevViolation } = useRenderer(canvas);

const tooltipStyle = computed(() => {
  const offset = 12;
  const padding = 8;
  let left = mouseX.value + offset;
  let top = mouseY.value + offset;

  if (!import.meta.client) {
    return { left: `${left}px`, top: `${top}px` };
  }

  const tooltipWidth = tooltip.value?.offsetWidth ?? 260;
  const tooltipHeight = tooltip.value?.offsetHeight ?? 120;

  if (left + tooltipWidth > window.innerWidth - padding) {
    left = mouseX.value - tooltipWidth - offset;
  }
  if (top + tooltipHeight > window.innerHeight - padding) {
    top = mouseY.value - tooltipHeight - offset;
  }

  left = Math.max(padding, left);
  top = Math.max(padding, top);

  return { left: `${left}px`, top: `${top}px` };
});
</script>
