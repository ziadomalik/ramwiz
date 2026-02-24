<template>
  <div class="flex justify-between gap-4 bg-neutral-900 text-neutral-200 border-t border-neutral-800 px-2 py-1 text-xs font-mono w-full">
    <span class="text-neutral-400">Debug Tools</span>
    <div class="flex gap-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-1.5">
          <div class="flex gap-1.5 border-l border-neutral-800 pl-2 ">
            <span class="text-neutral-400">Hovering Over: </span>
            <div class="flex gap-1.5 w-12 justify-end">
              <span class="font-bold">{{ hoveredEvent ? hoveredEvent.cmdId : "Nothing" }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HitResult } from '@/lib/rendering/trace';

const props = withDefaults(defineProps<{
  hoveredEvent: HitResult | null;
}>(), {});
</script>
