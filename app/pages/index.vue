<template>
  <div>Count: {{ count }}</div>
  <UButton @click="count++">Click me</UButton>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>