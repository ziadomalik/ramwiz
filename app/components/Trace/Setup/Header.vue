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
      </div>
    </template>
  </UPageHeader>
</template>

<script setup lang="ts">
defineProps<{ title: string; description: string; to: string; }>();
</script>