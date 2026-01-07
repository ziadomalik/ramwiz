<script setup lang="ts">
import { ref } from "vue";

import { invoke } from "@tauri-apps/api/core";
import TraceFileUpload from "../components/TraceFileUpload.vue";

const loading = ref(false);

const loadTrace = async (path: string) => {
  loading.value = true;
  try {
    const totalEvents = await invoke("load_trace", { path });
    console.log(totalEvents);
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
