<template>
  <div class="flex justify-end gap-4 bg-neutral-900 text-neutral-200 border-t border-neutral-800 px-2 py-1 text-xs font-mono w-full">
    <div class="flex gap-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-1.5">
          <div class="flex gap-1.5">
            <span class="text-neutral-400">Current LOD: </span>
            <span class="font-bold">{{ props.currentLod }}</span>
          </div>
          <div class="flex gap-1.5 border-l border-neutral-800 pl-2 ">
            <span class="text-neutral-400">Events Loaded: </span>
            <div class="flex gap-1.5 w-28 justify-end">
              <span class="font-bold">{{ formattedEvents }}</span>
              <span class="font-bold text-neutral-400">({{ eventsLoadedPercentage }}%)</span>
            </div>
          </div>
          <div v-if="props.violationCount > 0" class="flex items-center gap-1.5 border-l border-neutral-800 pl-2">
            <span class="text-red-400">Violations:</span>
            <span class="font-bold text-red-400">{{ formattedViolations }}</span>
            <button
              class="px-1 py-0.5 rounded hover:bg-red-400/20 text-red-400 transition-colors"
              title="Previous violation"
              @click="$emit('prev-violation')"
            >◀</button>
            <button
              class="px-1 py-0.5 rounded hover:bg-red-400/20 text-red-400 transition-colors"
              title="Next violation"
              @click="$emit('next-violation')"
            >▶</button>
          </div>
          <div class="flex gap-1.5 border-l border-neutral-800 pl-2 min-w-12">
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
  currentLod: string;
  violationCount: number;
}>(), {
  fps: 0,
  eventCount: 0,
  totalEvents: 0,
  violationCount: 0,
});

defineEmits<{
  'prev-violation': [];
  'next-violation': [];
}>();

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

const formattedViolations = computed(() => {
  return formatter.format(props.violationCount);
});
</script>
