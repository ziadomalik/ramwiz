<template>
  <div class="w-full flex gap-2 bg-neutral-900">
    <UButton 
      class="rounded-none cursor-pointer" 
      label="New Trace"
      icon="i-lucide-plus" 
      size="xs" 
      to="/" 
    />
    <UPopover>
      <UButton
        class="rounded-none cursor-pointer"
        label="Settings"
        icon="i-lucide-settings-2"
        size="xs"
        :disabled="!hasCommands"
      />
      <template #content>
        <div class="w-48 max-h-96 overflow-auto p-3 space-y-2 bg-neutral-900">
          <p class="text-xs text-neutral-400">Command Colors</p>
          <div v-if="!hasCommands" class="text-xs text-neutral-500">Load a trace to edit colors.</div>
          <div
            v-for="[id, name] in commands"
            :key="id"
            class="flex items-center justify-between gap-2"
          >
            <span class="font-mono text-xs text-neutral-200 truncate">{{ name }}</span>
            <UPopover>
              <UButton
                :ui="{ base: 'p-0 sm:p-0' }"
                color="neutral"
                variant="outline"
                class="rounded-full shrink-0"
              >
                <span :style="{ backgroundColor: getColor(Number(id)) }" class="size-6 rounded-full" />
              </UButton>
              <template #content>
                <UColorPicker
                  :model-value="getColor(Number(id))"
                  @update:model-value="(value) => updateColor(Number(id), String(value))"
                  class="p-2"
                />
              </template>
            </UPopover>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
const sessionStore = useSessionStore();

const commands = computed<[string, string][]>(() =>
  Object.entries(sessionStore.dictionary?.commands ?? {}).sort((a, b) => Number(a[0]) - Number(b[0])),
);

const hasCommands = computed(() => commands.value.length > 0);

function getColor(id: number): string {
  return sessionStore.getCommandColor(id) ?? '#CCCCCC';
}

async function updateColor(id: number, color: string) {
  await sessionStore.setCommandColor(id, color);
}
</script>