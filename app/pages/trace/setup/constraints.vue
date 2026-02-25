<template>
  <TraceSetupHeader to="/trace/setup/memory" title="Timing Constraints"
    description="Define cycle-time constraints between commands" />

  <div v-for="scope in SCOPES" :key="scope.value">
    <div class="flex items-center justify-between pt-5 pb-2">
      <span class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{{ scope.label }} scope</span>
      <span class="text-xs text-neutral-500">{{ getRulesForScope(scope.value).length }} rules</span>
    </div>

    <div class="space-y-2">
      <UCard v-for="rule in getRulesForScope(scope.value)" :key="rule.id" :ui="{ body: 'p-3 sm:p-3' }">
        <div class="space-y-3">
          <!-- Row 1: enable + description + delete -->
          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="rule.enabled"
              class="rounded border-neutral-600 accent-primary-500 shrink-0 cursor-pointer">
            <input v-model="rule.description" placeholder="Description"
              class="flex-1 text-sm bg-transparent border-none outline-none text-neutral-200 placeholder-neutral-600 min-w-0" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" @click="removeRule(rule.id)" />
          </div>

          <!-- Row 2: preceding → following -->
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <span class="text-[10px] text-neutral-500 uppercase mb-1 block">Preceding</span>
              <TraceSetupCommandPicker v-model="rule.preceding" :commands="commandOptions" label="Select…" />
            </div>
            <span class="text-neutral-600 mt-4 shrink-0">→</span>
            <div class="flex-1 min-w-0">
              <span class="text-[10px] text-neutral-500 uppercase mb-1 block">Following</span>
              <TraceSetupCommandPicker v-model="rule.following" :commands="commandOptions" label="Select…" />
            </div>
          </div>

          <!-- Row 3: latency + optional fields -->
          <div class="flex items-center gap-3 flex-wrap">
            <div>
              <span class="text-[10px] text-neutral-500 uppercase mb-1 block">Latency</span>
              <UInput v-model.number="rule.latencyCycles" type="number" placeholder="0" class="w-24">
                <template #trailing>
                  <span class="text-xs text-neutral-500 select-none">clk</span>
                </template>
              </UInput>
            </div>

            <div v-if="scope.value === 'rank' || rule.window != null">
              <span class="text-[10px] text-neutral-500 uppercase mb-1 block">Window</span>
              <UInput v-model.number="rule.window" type="number" placeholder="—" class="w-20" />
            </div>

            <label v-if="scope.value === 'rank'"
              class="flex items-center gap-1.5 mt-4 cursor-pointer select-none">
              <input type="checkbox" v-model="rule.siblingRank"
                class="rounded border-neutral-600 accent-primary-500">
              <span class="text-xs text-neutral-400">Sibling rank</span>
            </label>
          </div>
        </div>
      </UCard>

      <UButton @click="addRule(scope.value)" icon="i-lucide-plus" variant="outline" color="neutral" size="sm"
        class="w-full" block>
        Add Rule
      </UButton>
    </div>
  </div>

  <div class="pt-6">
    <UButton size="lg" square @click="onContinue" :loading="loading"
      class="w-full flex items-center justify-center" trailing-icon="i-lucide-arrow-right">
      Continue
    </UButton>
  </div>
</template>

<script setup lang="ts">
import type { ConstraintRule, ConstraintScope } from '@/composables/useBackend';

definePageMeta({ layout: 'setup' });

const SCOPES: { value: ConstraintScope; label: string }[] = [
  { value: 'channel', label: 'Channel' },
  { value: 'rank', label: 'Rank' },
  { value: 'bankgroup', label: 'Bankgroup' },
  { value: 'bank', label: 'Bank' },
];

const sessionStore = useSessionStore();
const { trace } = useBackend();

if (!sessionStore.hasHeader) navigateTo('/');
if (!sessionStore.hasCommandConfig) navigateTo('/trace/setup/commands');
if (!sessionStore.hasMemoryLayout) navigateTo('/trace/setup/memory');

const rules = reactive<ConstraintRule[]>([]);

const commandOptions = computed(() => {
  const dict = sessionStore.dictionary?.commands ?? {};
  return Object.entries(dict).map(([id, name]) => ({ value: Number(id), label: name }));
});

function getRulesForScope(scope: ConstraintScope): ConstraintRule[] {
  return rules.filter(r => r.scope === scope);
}

function addRule(scope: ConstraintScope) {
  rules.push({
    id: crypto.randomUUID(),
    scope,
    preceding: [],
    following: [],
    latencyCycles: 0,
    description: '',
    enabled: true,
  });
}

function removeRule(id: string) {
  const idx = rules.findIndex(r => r.id === id);
  if (idx >= 0) rules.splice(idx, 1);
}

const { pending } = await useAsyncData('constraints', async () => {
  // Ensure dictionary is available
  if (!sessionStore.hasDictionary) {
    const dict = await trace.getDictionary();
    sessionStore.setDictionary(dict);
  }

  const saved = await sessionStore.loadSavedConstraintConfig();
  if (saved?.rules?.length) {
    rules.splice(0, rules.length, ...saved.rules.map(r => ({ ...r, enabled: r.enabled ?? true })));
  } else {
    rules.splice(0, rules.length);
  }

  return saved;
});

const loading = ref(false);

const onContinue = async () => {
  loading.value = true;
  try {
    await sessionStore.setConstraintConfig({ rules: [...rules] });
    navigateTo('/trace/view');
  } catch (error) {
    console.error('Error saving constraint config:', error);
  } finally {
    loading.value = false;
  }
};
</script>

