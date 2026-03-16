<template>
  <div class="p-4 text-sm text-zinc-400">Setup is automatic now. Redirecting to trace view...</div>
</template>

<script setup lang="ts">
const sessionStore = useSessionStore();
const { trace } = useBackend();

if (!sessionStore.hasHeader) {
  await navigateTo('/');
} else {
  if (!sessionStore.hasDictionary) {
    const dictionary = await trace.getDictionary();
    await sessionStore.setDictionary(dictionary);
  }

  await navigateTo('/trace/view');
}
</script>