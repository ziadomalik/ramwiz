<template>
  <UDashboardGroup>
    <UDashboardSidebar :ui="{ body: 'p-0 gap-0' }">
      <div :style="{ height: PADDING_TOP }" class="sticky top-0 z-50">
        <Toolbar />
        <div class="border-b border-neutral-800 mt-px"></div>
      </div>
      <div ref="treeContainer" class="h-full overflow-auto">
        <UTree v-model:expanded="expandedState" size="xl" :items="items" :ui="{ root: 'border-b border-neutral-800', link: 'rounded-none before:rounded-none', itemWithChildren: 'ps-0' }" >
          <template #item-label="{ item }">
            {{ item.name }}
          </template>
          <template #item-leading>
            <!-- DONT SHOVE YOUR DISGUSTING ICONS DOWN MY THROAT NUXT UI -->
            <div></div>
          </template>
        </UTree>
        <pre>{{ expandedState }}</pre>
      </div>
    </UDashboardSidebar>
    <UDashboardPanel>
      <slot />
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import type { TreeItem } from '@nuxt/ui'

const PADDING_TOP = '25px'
const uiStore = useUIStore()
const sessionStore = useSessionStore()

const treeContainer = ref<HTMLElement | null>(null)

await useAsyncData('memoryLayoutTrace', async () => sessionStore.loadSavedMemoryLayout())

const updateLayout = () => {
  if (!treeContainer.value) return
  const rows = treeContainer.value.querySelectorAll('button[data-slot="link"]')

  let lastEncounteredChannel: number | undefined = undefined
  let lastEncounteredBankgroup: number | undefined = undefined

  const layout = Array.from(rows).map((rowElement) => {
    let row = rowElement as HTMLButtonElement;
    const rect = row.getBoundingClientRect();

    if (row.innerText.includes('Channel')) {
      let cleanInnerText = row.innerText.replace(/\n/g, ' ');
      lastEncounteredChannel = parseInt(cleanInnerText.split(' ')[1]!);
    }

    if (row.innerText.includes('Bankgroup')) {
      let cleanInnerText = row.innerText.replace(/\n/g, ' ');
      lastEncounteredBankgroup = parseInt(cleanInnerText.split(' ')[1]!);
    }

    let bank = undefined
    if (row.innerText.includes('Bank') && !row.innerText.includes('Bankgroup')) {
      let cleanInnerText = row.innerText.replace(/\n/g, ' ');
      bank = parseInt(cleanInnerText.split(' ')[1]!);
    }

    return { top: rect.top, height: rect.height, channel: lastEncounteredChannel, bankgroup: lastEncounteredBankgroup, bank }
  })

  uiStore.setRowLayout(layout)
}

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  // Give a small delay for initial render
  requestAnimationFrame(() => {
    updateLayout()
  })

  if (treeContainer.value) {
    resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(treeContainer.value)

    mutationObserver = new MutationObserver(updateLayout)
    mutationObserver.observe(treeContainer.value, { 
      childList: true, 
      subtree: true, 
      attributes: true 
    })
  }
  
  window.addEventListener('resize', updateLayout)
  // Capture scroll events to update positions if sidebar scrolls
  window.addEventListener('scroll', updateLayout, true)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  window.removeEventListener('resize', updateLayout)
  window.removeEventListener('scroll', updateLayout, true)
})

function getUniqueTreeItemId(chIdx: number, bgIdx?: number, bIdx?: number) {
  let id = ['ch' + chIdx]

  if (bgIdx !== undefined) {
    id.push('bg' + bgIdx)
  }

  if (bIdx !== undefined) {
    id.push('b' + bIdx)
  }

  return id.join('_')
}

// All channels are expanded by default.
const expandedState = computed({
  get: () => { 
    if (uiStore.expandedState.length === 0) {
      return Array(sessionStore.memoryLayout?.numChannels).fill('').map((_, chIdx) => `ch${chIdx}`)
    }

    return uiStore.expandedState
  },
  set: (value: string[]) => uiStore.setExpandedState(value)
}) 

// NOTE: apparently NuxtUI checks uniqueness by label, so if one clicks `Bankgroup 0`, all bankgroups within all channels will expand.
// Therefore we will do a very stupid hack by treating `label` as an id and adding our own `name` field we use to display the label.
// To me this is a better solution than to integrate another UI library or even implementing my own tree component. 
const items = computed<TreeItem[]>(() => (
  Array(sessionStore.memoryLayout?.numChannels).fill({}).map((_, chIdx) => ({
    name: `Channel ${chIdx}`,
    label: getUniqueTreeItemId(chIdx),
    children: Array(sessionStore.memoryLayout?.numBankgroups).fill({}).map((_, bgIdx) => ({
      name: `Bankgroup ${bgIdx}`,
      label: getUniqueTreeItemId(chIdx, bgIdx), 
      children: Array(sessionStore.memoryLayout?.numBanks).fill({}).map((_, bIdx) => ({
        name: `Bank ${bIdx}`,
        label: getUniqueTreeItemId(chIdx, bgIdx, bIdx),
      }))
    }))
  }))
))
</script>
