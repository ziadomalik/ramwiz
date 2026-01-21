<template>
  <div class="w-96 min-h-48 mx-auto space-y-4">
    <UFileUpload :model-value="dummyFile" label="Drop your trace here" layout="list" @click.prevent="loadTrace" />
    <UButton block square size="lg" @click="continueToSetup" :disabled="disabled" :loading="loading">Upload</UButton>
  </div>
</template>

<script setup lang="ts">
import type { FileMetadata } from '@/lib/backend';
import { loadTraceDialog, loadTraceHandler } from '@/lib/backend';

const fileMetadata = ref<FileMetadata | null>(null);

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
  fileMetadata.value = await loadTraceDialog();
  console.log(fileMetadata.value);
}

const continueToSetup = async () => {
  
  loading.value = true;
  
  try {
    if (!fileMetadata.value) {
      throw new Error('Trace file not selected');
    }

    await loadTraceHandler(fileMetadata.value.path);
    navigateTo('/trace/setup');
  } finally {
    loading.value = false;
  }
}
</script>