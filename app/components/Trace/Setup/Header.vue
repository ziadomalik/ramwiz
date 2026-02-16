<template>
  <UPageHeader 
    :title="title"
    :description="description"
    :ui="{ wrapper: 'gap-0', root: 'py-4', description: 'mt-1' }"
  >
    <template #headline>
      <div class="flex gap-2 justify-between items-center">
        <UButton 
          to="/"
          size="xs"
          variant="soft" 
          label="Go back" 
          color="neutral"
          class="rounded-full"  
          icon="i-lucide-arrow-left"
        />
        <UButton 
          class="cursor-pointer rounded-full" 
          label="Import Config"
          icon="i-lucide-upload" 
          color="secondary"
          variant="subtle"
          size="xs" 
          @click="handleImport"
        />
      </div>
    </template>
  </UPageHeader>
</template>

<script setup lang="ts">
defineProps<{ title: string; description: string; to: string; }>();

const sessionStore = useSessionStore();

async function handleImport() {
  try {
    const imported = await sessionStore.importConfigFromYaml();
    if (imported) {
      // Re-trigger useAsyncData on the current setup page so local reactives update
      await refreshNuxtData();
    }
  } catch (e) {
    console.error('Failed to import config:', e);
  }
}
</script>