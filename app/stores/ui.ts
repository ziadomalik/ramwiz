import { defineStore } from 'pinia';

export interface RowLayout {
  top: number;
  height: number;
}

export const useUIStore = defineStore('ui', {
  state: () => ({
    rowLayout: [] as RowLayout[],
  }),
  actions: {
    setRowLayout(layout: RowLayout[]) {
      this.rowLayout = layout;
    },
  },
});

