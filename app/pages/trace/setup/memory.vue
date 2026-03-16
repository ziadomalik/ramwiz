<template>
  <div class="p-4 text-sm text-zinc-400">Setup is automatic now. Redirecting to trace view...</div>
</template>

<script setup lang="ts">
const sessionStore = useSessionStore();

if (!sessionStore.hasHeader) {
  await navigateTo('/');
} else {
  await navigateTo('/trace/view');
}
</script>