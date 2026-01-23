<template>
  <div class="flex justify-between gap-4 bg-[#222] text-[#eee] px-2 py-1 text-xs font-mono w-full">
    <div></div>
    <div class="flex gap-4">
      <div class="flex gap-1.5">
        <span class="text-[#aaa]">FPS:</span>
        <span class="font-bold">{{ fps }}</span>
      </div>
      <div class="flex gap-1.5">
        <span class="text-[#aaa]">Events:</span>
        <span class="font-bold">{{ formattedEvents }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  fps: number;
  eventCount: number;
}>();

const formattedEvents = computed(() => {
  return new Intl.NumberFormat('en-US').format(props.eventCount);
});
</script>
