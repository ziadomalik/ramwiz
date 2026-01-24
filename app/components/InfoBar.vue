<template>
  <div class="flex justify-end gap-4 bg-neutral-800 text-neutral-200 border-t border-neutral-700 px-2 py-1 text-xs font-mono w-full">
    <div class="flex gap-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-1.5">
          <div class="flex gap-1.5">
            <span class="text-neutral-400">Events Loaded: </span>
            <div class="flex gap-1.5 w-28 justify-end">
              <span class="font-bold">{{ formattedEvents }}</span>
              <span class="font-bold text-neutral-400">({{ eventsLoadedPercentage }}%)</span>
            </div>
          </div>
          <div class="flex gap-1.5 border-l border-neutral-700 pl-2 min-w-12">
            <span class="text-neutral-400">FPS:</span>
            <span class="font-bold">{{ formattedFPS }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  fps: number;
  eventCount: number;
  totalEvents: number;
}>(), {
  fps: 0,
  eventCount: 0,
  totalEvents: 0,
});

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
</script>
