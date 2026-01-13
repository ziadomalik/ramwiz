<script setup lang="ts">
import { ref, computed } from "vue";
import { openFileDialogForTraceFiles } from "../backend";

const toast = useToast();

const emit = defineEmits<{
  (e: "loadTrace", path: string): void;
}>();

const props = defineProps<{
  loading: boolean;
}>();

const selectedPath = ref<string | null>(null);

const selectFile = async () => {
  try {
    const path = await openFileDialogForTraceFiles();

    if (path) {
      selectedPath.value = path;
    }
  } catch (error) {
    toast.add({
      color: "error",
      icon: "i-lucide-file-x",
      title: "Failed to select a trace file",
      description: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const loadTrace = () => {
  if (selectedPath.value) {
    emit("loadTrace", selectedPath.value);
  }
};

const fileName = computed(() =>
  selectedPath.value?.split(/[\\/]/).pop() ?? null
);

defineExpose({ reset: () => (selectedPath.value = null) });
</script>

<template>
  <div class="w-full max-w-sm">
    <div
      @click="selectFile"
      @keydown.enter="selectFile"
      @keydown.space.prevent="selectFile"
      role="button"
      tabindex="0"
      class="w-full min-h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <template v-if="selectedPath">
        <UIcon name="i-lucide-file" class="text-4xl text-primary-500 mb-2" />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ fileName }}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 px-4 truncate max-w-full">{{ selectedPath }}</p>
      </template>
      <template v-else>
        <UIcon name="i-lucide-folder-open" class="text-4xl text-gray-400 mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400">Click to select a trace file</p>
      </template>
    </div>
    <UButton
      block
      class="mt-4 cursor-pointer"
      icon="i-lucide-upload"
      :disabled="!selectedPath"
      :loading="loading"
      size="lg"
      @click="loadTrace"
    >
      Load Trace
    </UButton>
  </div>
</template>