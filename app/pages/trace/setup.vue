<template>
  <div class="min-h-screen flex flex-col items-center justify-center">
    <div class="w-md space-y-3">
    <pre>
      Parsed header:
      ----------------------------
      Magic: {{ sessionStore.header?.magic?.map((n: number) => String.fromCharCode(n)).join('') }}
      Version: {{ sessionStore.header?.version }}
      Number of commands: {{ Object.keys(dictionary).length }}
      Dictionary offset: {{ sessionStore.header?.dict_offset }}
      Number of entries: {{ sessionStore.header?.num_entries }}
      ----------------------------
    </pre>
      <div v-for="(command, id) in dictionary" :key="id" class="flex items-center justify-between gap-4 p-3 rounded-lg transition-colors border border-neutral-200">
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
      <UButton class="" block square size="lg" @click="onContinue" :disabled="pending" :loading="pending">Continue</UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import { loadDictionaryHandler } from '@/lib/backend';

const COLORS = [
  '#A8D8EA', '#FFCAB1', '#B5EAD7', '#E2B6CF',
  '#C7CEEA', '#FFEAA7', '#DCD6F7', '#F8B595',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F5CBA7', '#AED6F1',
];

const commandColors = reactive<Record<number, string>>({});
const clockPeriods = reactive<Record<number, number | undefined>>({});

const sessionStore = useSessionStore();
const dictionary = computed(() => sessionStore.dictionary?.commands ?? {});

if (!sessionStore.hasHeader) {
  navigateTo('/');
}

const { pending } = await useAsyncData('dictionary', async () => {
  const dictionary = await loadDictionaryHandler();
  sessionStore.setDictionary(dictionary);

  Object.keys(dictionary.commands).forEach((id, index) => {
    const numId = Number(id);
    commandColors[numId] = COLORS[index % COLORS.length] ?? '#CCCCCC';
    clockPeriods[numId] = undefined;
  });

  return dictionary;
});

const onContinue = () => {
  // TODO: Save config and navigate to next step
  console.log('Colors:', commandColors);
  console.log('Clock periods:', clockPeriods);
};
</script>