<template>
  <pre>
    {{ entry }}
  </pre>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
const { data: entry } = await useAsyncData('entry', async () => await invoke('load_entry', { index: 0 }));

</script>