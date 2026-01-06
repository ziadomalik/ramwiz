<script setup lang="ts">
import { ref } from "vue";

const value = ref<File | null>(null);

const ui = {
  fileTrailingButton: "cursor-pointer",
};
</script>

<template>
  <div class="flex flex-col items-center justify-center h-screen">
    <div class="div w-full max-w-sm">
      <UFileUpload
        v-model="value"
        class="w-96 min-h-48"
        layout="list"
        :ui="ui"
      />
      <UButton
        block
        class="mt-4 cursor-pointer"
        icon="i-lucide-upload"
        :disabled="!value"
        size="lg"
      >
        Load Trace
      </UButton>
    </div>
  </div>
</template>
