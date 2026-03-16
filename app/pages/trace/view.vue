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
      <span><span class="text-zinc-500">BUS</span> {{ busName }}</span>
      <span><span class="text-zinc-500">RA</span> {{ hoveredEvent.rank }}</span>
      <span><span class="text-zinc-500">BG</span> {{ hoveredEvent.bankgroup }}</span>
      <span><span class="text-zinc-500">BNK</span> {{ hoveredEvent.bank }}</span>
      <span><span class="text-zinc-500">ROW</span> {{ hoveredEvent.row }}</span>
      <span><span class="text-zinc-500">COL</span> {{ hoveredEvent.column }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'trace',
});

const sessionStore = useSessionStore();

const color = computed(() => sessionStore.getCommandColor(hoveredEvent.value?.cmdId ?? 0));
const name = computed(() => sessionStore.getCommandName(hoveredEvent.value?.cmdId ?? 0));
const busName = computed(() => hoveredEvent.value?.bus === 1 ? 'Data' : 'Command');

const canvas = ref<HTMLCanvasElement | null>(null);
const tooltip = ref<HTMLDivElement | null>(null);
const { stats, viewState, hoveredEvent, mouseX, mouseY } = useRenderer(canvas);

const tooltipStyle = computed(() => {
  const offset = 12;
  const padding = 8;
  const isCommandBus = hoveredEvent.value?.bus === 0;

  // Mirror popup placement for command-bus events so it is less likely
  // to cover the paired data-bus event below.
  let left = isCommandBus ? mouseX.value - offset : mouseX.value + offset;
  let top = isCommandBus ? mouseY.value - offset : mouseY.value + offset;

  if (!import.meta.client) {
    return { left: `${left}px`, top: `${top}px` };
  }

  const tooltipWidth = tooltip.value?.offsetWidth ?? 260;
  const tooltipHeight = tooltip.value?.offsetHeight ?? 120;

  if (!isCommandBus && left + tooltipWidth > window.innerWidth - padding) {
    left = mouseX.value - tooltipWidth - offset;
  }
  if (!isCommandBus && top + tooltipHeight > window.innerHeight - padding) {
    top = mouseY.value - tooltipHeight - offset;
  }
  if (isCommandBus && left - tooltipWidth < padding) {
    left = mouseX.value + offset;
  } else if (isCommandBus) {
    left = left - tooltipWidth;
  }
  if (isCommandBus && top - tooltipHeight < padding) {
    top = mouseY.value + offset;
  } else if (isCommandBus) {
    top = top - tooltipHeight;
  }

  left = Math.max(padding, left);
  top = Math.max(padding, top);

  return { left: `${left}px`, top: `${top}px` };
});
</script>
