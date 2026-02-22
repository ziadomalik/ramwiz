import { defineStore } from 'pinia';

export interface RowLayout {
  top: number;
  height: number;
  channel?: number;
  bankgroup?: number;
  bank?: number;
}

export const useUIStore = defineStore('ui', {
  state: () => ({
    rowLayout: [] as RowLayout[],
    expandedState: [] as string[],
    layoutVersion: 0,
  }),
  actions: {
    setRowLayout(layout: RowLayout[]) {
      this.rowLayout = layout;
      this.layoutVersion++;
    },

    setExpandedState(state: string[]) {
      this.expandedState = state;
      this.layoutVersion++;
    },
  },
});

