<template>
  <div class="flex items-center gap-1.5 bottom-4 left-[50%] translate-x-[-50%] fixed z-50 bg-neutral-800/90 backdrop-blur-sm px-2 py-1.5 rounded-md shadow-lg border border-neutral-700/50 text-xs font-mono">
    <UButton icon="i-lucide-chevron-left" size="xs" variant="ghost" color="neutral" class="cursor-pointer" @click="onPrev" />
    <div class="flex items-center gap-1.5 px-1">
      <UIcon name="i-lucide-circle-alert" class="text-red-400 size-3.5" />
      <span class="text-red-400">{{ formattedViolations }}</span>
      <span class="text-neutral-400">violations</span>
    </div>
    <UButton icon="i-lucide-chevron-right" size="xs" variant="ghost" color="neutral" class="cursor-pointer" @click="onNext" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  violations: number;
  onPrev: () => void;
  onNext: () => void;
}>();

const formattedViolations = computed(() => {
  return props.violations.toLocaleString();
});
</script>