<template>
  <div class="w-full flex gap-2 bg-neutral-900">
    <UButton 
      class="rounded-none cursor-pointer" 
      label="New Trace"
      icon="i-lucide-plus" 
      size="xs" 
      to="/" 
    />
    <UButton 
      class="rounded-none cursor-pointer" 
      label="Export Config"
      icon="i-lucide-download" 
      size="xs" 
      @click="handleExport"
    />
  </div>
</template>

<script setup lang="ts">
const { store } = useBackend();

async function handleExport() {
  try {
    await store.exportConfigYaml();
  } catch (e) {
    console.error('Failed to export config:', e);
  }
}
</script>