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
      </div>
    </UDashboardSidebar>
    <UDashboardPanel>
      <slot />
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import type { TreeItem } from '@nuxt/ui'
import type { RowLayout } from '~/stores/ui'

const PADDING_TOP = '25px'
const BUS_TIMELINES = [
  { id: 0, key: 'cmd', name: 'Command Bus' },
  { id: 1, key: 'data', name: 'Data Bus' },
] as const;
const uiStore = useUIStore()
const sessionStore = useSessionStore()

const treeContainer = ref<HTMLElement | null>(null)

// The DOM buttons appear in the same order as a depth-first tree traversal
// respecting the current expand/collapse state, so we walk the tree structure
// in lockstep with the DOM node list.
const updateLayout = () => {
  if (!treeContainer.value) return
  const buttons = treeContainer.value.querySelectorAll('button[data-slot="link"]')
  if (buttons.length === 0) return

  const ml = sessionStore.memoryLayout
  if (!ml) return

  const expandedSet = new Set(expandedState.value)
  const layout: RowLayout[] = []
  let domIdx = 0

  for (let ch = 0; ch < ml.numChannels; ch++) {
    const el = buttons[domIdx] as HTMLElement | undefined
    if (!el) break
    const rect = el.getBoundingClientRect()
    layout.push({ top: rect.top, height: rect.height, channel: ch })
    domIdx++

    if (!expandedSet.has(`ch${ch}`)) continue

    for (const bus of BUS_TIMELINES) {
      const busEl = buttons[domIdx] as HTMLElement | undefined
      if (!busEl) break
      const busRect = busEl.getBoundingClientRect()
      layout.push({ top: busRect.top, height: busRect.height, channel: ch, bus: bus.id })
      domIdx++

      const busId = getUniqueTreeItemId(ch, bus.key)
      if (!expandedSet.has(busId)) continue

      for (let rank = 0; rank < ml.numRanks; rank++) {
        const rankEl = buttons[domIdx] as HTMLElement | undefined
        if (!rankEl) break
        const rankRect = rankEl.getBoundingClientRect()
        layout.push({ top: rankRect.top, height: rankRect.height, channel: ch, bus: bus.id, rank })
        domIdx++

        const rankId = getUniqueTreeItemId(ch, bus.key, rank)
        if (!expandedSet.has(rankId)) continue

        for (let bg = 0; bg < ml.numBankgroups; bg++) {
          const bgEl = buttons[domIdx] as HTMLElement | undefined
          if (!bgEl) break
          const bgRect = bgEl.getBoundingClientRect()
          layout.push({ top: bgRect.top, height: bgRect.height, channel: ch, bus: bus.id, rank, bankgroup: bg })
          domIdx++

          const bgId = getUniqueTreeItemId(ch, bus.key, rank, bg)
          if (!expandedSet.has(bgId)) continue

          for (let b = 0; b < ml.numBanks; b++) {
            const bankEl = buttons[domIdx] as HTMLElement | undefined
            if (!bankEl) break
            const bankRect = bankEl.getBoundingClientRect()
            layout.push({ top: bankRect.top, height: bankRect.height, channel: ch, bus: bus.id, rank, bankgroup: bg, bank: b })
            domIdx++
          }
        }
      }
    }
  }

  uiStore.setRowLayout(layout)
}

// Coalesce multiple layout triggers into a single RAF to avoid redundant work.
let layoutRafId = 0
const scheduleLayoutUpdate = () => {
  if (layoutRafId) return
  layoutRafId = requestAnimationFrame(() => {
    layoutRafId = 0
    updateLayout()
  })
}

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  // Give a small delay for initial render
  requestAnimationFrame(() => {
    updateLayout()
  })

  if (treeContainer.value) {
    resizeObserver = new ResizeObserver(scheduleLayoutUpdate)
    resizeObserver.observe(treeContainer.value)

    mutationObserver = new MutationObserver(scheduleLayoutUpdate)
    mutationObserver.observe(treeContainer.value, { 
      childList: true, 
      subtree: true, 
      attributes: true 
    })
  }
  
  window.addEventListener('resize', scheduleLayoutUpdate)
  // Capture scroll events to update positions if sidebar scrolls
  window.addEventListener('scroll', scheduleLayoutUpdate, true)
})

onUnmounted(() => {
  if (layoutRafId) cancelAnimationFrame(layoutRafId)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  window.removeEventListener('resize', scheduleLayoutUpdate)
  window.removeEventListener('scroll', scheduleLayoutUpdate, true)
})

function getUniqueTreeItemId(chIdx: number, busKey?: string, rankIdx?: number, bgIdx?: number, bIdx?: number) {
  const id: string[] = ['ch' + chIdx]

  if (busKey !== undefined) {
    id.push(busKey)
  }

  if (rankIdx !== undefined) {
    id.push('rk' + rankIdx)
  }

  if (bgIdx !== undefined) {
    id.push('bg' + bgIdx)
  }

  if (bIdx !== undefined) {
    id.push('b' + bIdx)
  }

  return id.join('_')
}

// All channels are expanded by default.
// NOTE: This array also keeps track of children that are expanded even when their parent is collapsed.
// When their parent is collapsed we want to ignore them when calculating the y-indices.
const expandedState = computed({
  get: () => { 
    if (uiStore.expandedState.length === 0) {
      const channelCount = sessionStore.memoryLayout?.numChannels ?? 0;
      return Array.from({ length: channelCount }, (_, chIdx) => `ch${chIdx}`)
    }

    return uiStore.expandedState
  },
  set: (value: string[]) => uiStore.setExpandedState(value)
}) 

// NOTE: apparently NuxtUI checks uniqueness by label, so if one clicks `Bankgroup 0`, all bankgroups within all channels will expand.
// Therefore we will do a very stupid hack by treating `label` as an id and adding our own `name` field we use to display the label.
// To me this is a better solution than to integrate another UI library or even implementing my own tree component. 
const items = computed<TreeItem[]>(() => {
  const ml = sessionStore.memoryLayout
  if (!ml) return []

  return Array.from({ length: ml.numChannels }, (_, chIdx) => ({
    name: `Channel ${chIdx}`,
    label: getUniqueTreeItemId(chIdx),
    children: BUS_TIMELINES.map((bus) => ({
      name: bus.name,
      label: getUniqueTreeItemId(chIdx, bus.key),
      children: Array.from({ length: ml.numRanks }, (_, rankIdx) => ({
        name: `Rank ${rankIdx}`,
        label: getUniqueTreeItemId(chIdx, bus.key, rankIdx),
        children: Array.from({ length: ml.numBankgroups }, (_, bgIdx) => ({
          name: `Bankgroup ${bgIdx}`,
          label: getUniqueTreeItemId(chIdx, bus.key, rankIdx, bgIdx),
          children: Array.from({ length: ml.numBanks }, (_, bIdx) => ({
            name: `Bank ${bIdx}`,
            label: getUniqueTreeItemId(chIdx, bus.key, rankIdx, bgIdx, bIdx),
          }))
        }))
      }))
    }))
  }))
})
</script>
