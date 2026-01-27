<template>
  <UDashboardGroup>
    <UDashboardSidebar :ui="{ body: 'p-0 gap-0' }">
      <div :style="{ height: PADDING_TOP }">
        <Toolbar />
        <div class="border-b border-neutral-800 mt-px"></div>
      </div>
      <div ref="treeContainer">
        <UTree size="xl" :items="items" :ui="{ root: 'border-b border-neutral-800', link: 'rounded-none before:rounded-none', itemWithChildren: 'ps-0' }" />
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

const updateLayout = () => {
  if (!treeContainer.value) return
  const rows = treeContainer.value.querySelectorAll('li[role="presentation"], button[data-slot="link"]')
  const layout = Array.from(rows).map(row => {
    const rect = row.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
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

const items = computed<TreeItem[]>(() => (
  Array(sessionStore.memoryLayout?.numChannels).fill({}).map((_, chIdx) => ({
    label: `Channel ${chIdx}`,
    defaultExpanded: true,
    children: Array(sessionStore.memoryLayout?.numBankgroups).fill({}).map((_, bgIdx) => ({
      label: `Bankgroup ${bgIdx}`,
      children: Array(sessionStore.memoryLayout?.numBanks).fill({}).map((_, bIdx) => ({
        label: `Bank ${bIdx}`
      }))
    }))
  }))
))
</script>
