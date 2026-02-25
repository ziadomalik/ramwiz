<template>
  <div class="flex items-center justify-between bg-neutral-900 text-neutral-200 border-b border-neutral-800 px-2 py-1 text-xs font-mono w-full">
    <!-- Left: Navigation -->
    <div class="flex items-center gap-1">
      <UButton
        class="cursor-pointer"
        icon="i-lucide-plus"
        label="New Trace"
        size="xs"
        variant="ghost"
        color="neutral"
        to="/"
      />
      <UButton
        class="cursor-pointer"
        icon="i-lucide-download"
        label="Export"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="handleExport"
      />
    </div>

    <!-- Right: Stats -->
    <div class="flex items-center gap-4">
      <div class="flex gap-1.5">
        <span class="text-neutral-400">LOD</span>
        <span class="font-bold">{{ props.currentLod }}</span>
      </div>
      <div class="flex gap-1.5">
        <span class="text-neutral-400">Events</span>
        <span class="font-bold">{{ formattedEvents }}</span>
        <span class="font-bold text-neutral-400">({{ eventsLoadedPercentage }}%)</span>
      </div>
      <div class="flex gap-1.5">
        <span class="text-neutral-400">FPS</span>
        <span class="font-bold">{{ formattedFPS }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  fps: number;
  eventCount: number;
  totalEvents: number;
  currentLod: string;
}>(), {
  fps: 0,
  eventCount: 0,
  totalEvents: 0,
});

const { store } = useBackend();

const formatter = new Intl.NumberFormat('en-US');

const eventsLoadedPercentage = computed(() => {
  const pct = Math.round((props.eventCount / props.totalEvents) * 100) || 0;
  return formatter.format(pct).padStart(3, '0');
});

const formattedFPS = computed(() => {
  const padding = props.fps < 10 ? 2 : 0;
  return formatter.format(props.fps).padStart(padding, '0');
});

const formattedEvents = computed(() => {
  return formatter.format(props.eventCount);
});

async function handleExport() {
  try {
    await store.exportConfigYaml();
  } catch (e) {
    console.error('Failed to export config:', e);
  }
}
</script>
