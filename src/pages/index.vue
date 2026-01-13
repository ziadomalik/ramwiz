<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { loadTrace } from "../backend";
import TraceFileUpload from "../components/TraceFileUpload.vue";

const router = useRouter();
const loading = ref(false);

const handleLoadTrace = async (path: string) => {
  loading.value = true;
  try {
    const metadata = await loadTrace(path);
    // TODO: Look into introducing global state management instead of using query parameters.
    router.push({ path: "/trace", query: { metadata: JSON.stringify(metadata) } });
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col items-center justify-center h-screen">
    <TraceFileUpload :loading="loading" @loadTrace="handleLoadTrace" />
  </div>
</template>
