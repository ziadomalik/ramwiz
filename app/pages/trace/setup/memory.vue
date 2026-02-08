<template>
  <TraceSetupHeader to="/trace/setup/memory" title="Memory Layout" description="Please describe the organization of your memory." />
  <div class="space-y-6 py-6">
    <UFormField label="Number of Channels">
      <UInput :loading="pending" v-model="memoryLayout.numChannels" placeholder="0" type="number" class="w-full" size="lg" />
    </UFormField>
    <UFormField label="Bankgroups per Channel">
      <UInput :loading="pending" v-model="memoryLayout.numBankgroups" placeholder="0" type="number" class="w-full" size="lg" />
    </UFormField>
    <UFormField label="Banks per Bankgroup">
      <UInput :loading="pending" v-model="memoryLayout.numBanks" placeholder="0" type="number" class="w-full" size="lg" />
    </UFormField>
  </div>
  <UButton size="lg" square @click="onContinue" :disabled="missingInput" :loading="loading"
    class="w-full flex items-center justify-center" trailing-icon="i-lucide-arrow-right">
    Continue
  </UButton>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'setup'
});

const sessionStore = useSessionStore()

const memoryLayout = reactive<Partial<MemoryLayout>>({
  numChannels: undefined,
  numBankgroups: undefined,
  numBanks: undefined
})

const missingInput = computed(() => (
  !memoryLayout.numChannels || !memoryLayout.numBankgroups || !memoryLayout.numBanks
))

if (!sessionStore.hasHeader) {
  navigateTo('/');
}

if (!sessionStore.hasCommandConfig) {
  navigateTo('/trace/setup/commands');
}

const { pending } = await useAsyncData('memoryLayout', async () => {
  const savedMemoryLayout = await sessionStore.loadSavedMemoryLayout()

  if (memoryLayout) {
    memoryLayout.numChannels = savedMemoryLayout?.numChannels ?? 0;
    memoryLayout.numBankgroups = savedMemoryLayout?.numBankgroups ?? 0;
    memoryLayout.numBanks = savedMemoryLayout?.numBanks ?? 0;
  }
});

const loading = ref(false)
const onContinue = async () => {
  loading.value = true;
  try {
    if (missingInput.value) {
      throw Error('missing input!');
    }

    await sessionStore.setMemoryLayout(memoryLayout as MemoryLayout)
    navigateTo('/trace/view');

  } catch (error) {
    console.log('Error saving memory layout:', error)
  } finally {
    loading.value = false;
  }
}
</script>