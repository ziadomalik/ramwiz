<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { invoke } from "@tauri-apps/api/core";
import TraceFileUpload from "../components/TraceFileUpload.vue";

import type { TraceMetadata } from "../types";

const router = useRouter();

const loading = ref(false);

const loadTrace = async (path: string) => {
  loading.value = true;
  try {
    const metadata = await invoke<TraceMetadata>("load_trace", { path });
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
    <TraceFileUpload :loading="loading" @loadTrace="loadTrace" />
  </div>
</template>
