<template>
  <UDashboardGroup>
    <UDashboardSidebar :ui="{ body: 'p-0 gap-0' }">
      <div :style="{ 'padding-top': PADDING_TOP }" class="border-b border-neutral-800"></div>
      <div ref="treeContainer">
        <UTree size="xl" :items="items" :ui="{ link: 'rounded-none before:rounded-none', listWithChildren: 'pb-24 border-b border-neutral-800', itemWithChildren: 'ps-0' }" />
      </div>
    </UDashboardSidebar>
    <UDashboardPanel>
      <slot />
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import type { TreeItem } from '@nuxt/ui'
import { useUIStore } from '~/stores/ui'

const PADDING_TOP = '25px'
const uiStore = useUIStore()
const treeContainer = ref<HTMLElement | null>(null)

const updateLayout = () => {
  if (!treeContainer.value) return
  const rows = treeContainer.value.querySelectorAll('ul[data-slot="listWithChildren"]')
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

const items = ref<TreeItem[]>([
  {
    label: 'Channel 0',
    defaultExpanded: true,
    children: [
      {
        label: 'Rank 0',
        defaultExpanded: true,
        children: [
          {
            label: 'Bankgroup 0',
            children: [
              {
                label: 'Bank 0',
              },
              {
                label: 'Bank 1',
              }
            ]
          },
          {
            label: 'Bankgroup 1',
            children: [
              {
                label: 'Bank 0',
              },
              {
                label: 'Bank 1',
              }
            ]
          }
        ]
      },
    ]
  },
])
</script>
