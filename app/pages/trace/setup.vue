<template>
  <div class="min-h-screen flex flex-col items-center justify-center">
    <div class="w-md space-y-3">
      <div>
        <h1 class="text-3xl font-bold">Command Setup</h1>
        <p class="text-sm text-gray-500">Please provide a clock period for each command.</p>
      </div>
      <UCard v-for="(command, id) in dictionary" :key="id" :ui="{ body: 'p-3 sm:p-3' }">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UPopover>
              <UButton :ui="{ base: 'p-0 sm:p-0' }" color="neutral" variant="outline" class="rounded-full">
                <span :style="{ backgroundColor: commandColors[id] }" class="size-7 rounded-full" />
              </UButton>
              <template #content>
                <UColorPicker v-model="commandColors[id]" class="p-2" />
              </template>
            </UPopover>
            <span class="font-mono font-medium text-sm">{{ command }}</span>
          </div>
          <UInput type="number" placeholder="0" class="w-24 rounded-full" v-model="clockPeriods[id]">
            <template #trailing>
              <span class="text-sm text-gray-400 select-none">
                clk
              </span>
            </template>
          </UInput>
        </div>
      </UCard>
      <UButton :disabled="disableButton" class="w-full flex items-center justify-center" trailing-icon="i-lucide-arrow-right" @click="onContinue"
        :loading="pending" size="lg" square>
        Continue
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { CommandConfig } from '@/composables/useBackend';

const { trace } = useBackend();

const COLORS = [
  '#A8D8EA', '#FFCAB1', '#B5EAD7', '#E2B6CF',
  '#C7CEEA', '#FFEAA7', '#DCD6F7', '#F8B595',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F5CBA7', '#AED6F1',
];

const commandColors = reactive<Record<number, string>>({});
const clockPeriods = reactive<Record<number, number | undefined>>({});

const disableButton = computed(() => (Object.keys(clockPeriods).length !== Object.keys(dictionary.value).length) || pending.value);

const sessionStore = useSessionStore();
const dictionary = computed(() => sessionStore.dictionary?.commands ?? {});

if (!sessionStore.hasHeader) {
  navigateTo('/');
}

const { pending } = await useAsyncData('dictionary', async () => {
  const dictionary = await trace.getDictionary();
  sessionStore.setDictionary(dictionary);

  const savedConfig = await sessionStore.loadSavedCommandConfig();

  Object.keys(dictionary.commands).forEach((id, index) => {
    const numId = Number(id);
    commandColors[numId] = savedConfig?.colors[numId] ?? COLORS[index % COLORS.length] ?? '#CCCCCC';
    clockPeriods[numId] = savedConfig?.clockPeriods[numId] ?? undefined;
  });

  return dictionary;
});

const onContinue = async() => {
  const config: CommandConfig = {
    colors: { ...commandColors },
    clockPeriods: { ...clockPeriods },
  };

  await sessionStore.setCommandConfig(config);

  navigateTo('/trace/view');
};
</script>