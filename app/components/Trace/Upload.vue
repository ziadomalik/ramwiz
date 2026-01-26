<template>
  <div class="w-96 min-h-48 mx-auto space-y-4">
    <UFileUpload :model-value="dummyFile" label="Drop your trace here" layout="list" @click.prevent="loadTrace" />
    <UButton block square size="lg" @click="continueToSetup" :disabled="disabled" :loading="loading">Upload</UButton>
  </div>
</template>

<script setup lang="ts">
import type { FileMetadata } from '@/composables/useBackend';
import useBackend from '@/composables/useBackend';

const fileMetadata = ref<FileMetadata | null>(null);
const sessionStore = useSessionStore();
const { trace } = useBackend();

// To trick the UFileUpload component into rendering the selected file.
// Would rather do that hack than implement a custom component lol.
// TODO(ziad): Creating an array buffer is super wasteful, better solution to hook into the UFileUpload component.
const dummyFile = computed(() => (
  fileMetadata.value ? 
    new File([new ArrayBuffer(fileMetadata.value.size)], fileMetadata.value.name, { type: 'application/binary' }) : null
));

const loading = ref(false);
const disabled = computed(() => !fileMetadata.value);

const loadTrace = async () => {
  fileMetadata.value = null;
  fileMetadata.value = await trace.openFileDialog();
  console.log(fileMetadata.value);
}

const continueToSetup = async () => {
  
  loading.value = true;
  
  try {
    if (!fileMetadata.value) {
      throw new Error('Trace file not selected');
    }

    const header = await trace.startSession(fileMetadata.value.path);

    if (!header) {
      throw new Error('Failed to load trace header');
    }

    sessionStore.setHeader(header);
    navigateTo('/trace/setup');
  } finally {
    loading.value = false;
  }
}
</script>