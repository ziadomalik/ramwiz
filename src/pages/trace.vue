<script setup lang="ts">
import { useRoute } from "vue-router";
import type { TraceMetadata } from "../backend";

const route = useRoute();
const metadata = JSON.parse(route.query.metadata as string) as TraceMetadata;
</script>

<template>
  <div class="flex flex-col items-center justify-center h-screen">
    <h1>Trace</h1>
    <p>Total events: {{ metadata.total_events }}</p>
    <p>Time range: {{ metadata.clk_range }}</p>
    <p>File size: {{ metadata.file_size }}</p>
  </div>
</template>