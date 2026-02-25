<template>
  <UPopover :ui="{ content: 'p-0' }">
    <button type="button"
      class="flex flex-wrap gap-1 min-h-7 items-center px-2 py-1 border border-neutral-700 rounded-md bg-neutral-900 hover:border-neutral-500 transition-colors cursor-pointer w-full text-left">
      <span v-for="cmdId in modelValue" :key="cmdId"
        class="text-[11px] bg-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded font-mono leading-tight">
        {{ commandLabel(cmdId) }}
      </span>
      <span v-if="!modelValue.length" class="text-xs text-neutral-500">{{ label ?? 'Select…' }}</span>
    </button>

    <template #content>
      <div class="p-1.5 max-h-56 overflow-y-auto min-w-44">
        <div class="flex gap-1 mb-1.5 px-1">
          <button type="button" @click="selectAll"
            class="text-[10px] text-neutral-400 hover:text-neutral-200 cursor-pointer">All</button>
          <span class="text-neutral-700">·</span>
          <button type="button" @click="selectNone"
            class="text-[10px] text-neutral-400 hover:text-neutral-200 cursor-pointer">None</button>
        </div>
        <label v-for="cmd in commands" :key="cmd.value"
          class="flex items-center gap-2 text-xs font-mono cursor-pointer hover:bg-neutral-800 px-2 py-1 rounded select-none">
          <input type="checkbox" :checked="modelValue.includes(cmd.value)" @change="toggle(cmd.value)"
            class="rounded border-neutral-600 accent-primary-500">
          {{ cmd.label }}
        </label>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
export interface CommandOption {
  label: string;
  value: number;
}

const props = defineProps<{
  modelValue: number[];
  commands: CommandOption[];
  label?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number[]];
}>();

function commandLabel(id: number): string {
  return props.commands.find(c => c.value === id)?.label ?? `#${id}`;
}

function toggle(value: number) {
  const current = [...props.modelValue];
  const idx = current.indexOf(value);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(value);
  }
  emit('update:modelValue', current);
}

function selectAll() {
  emit('update:modelValue', props.commands.map(c => c.value));
}

function selectNone() {
  emit('update:modelValue', []);
}
</script>

