/// This file defines the store that holds the state of the current session, i.e. the trace that's currently being analyzed.
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----

import { defineStore } from 'pinia';

export const useSessionStore = defineStore('session', {
  state: () => ({
    header: null as Header | null,
    dictionary: null as Dictionary | null,
    memoryLayout: null as MemoryLayout | null,
    commandConfig: null as CommandConfig | null,
  }),

  getters: {
    hasHeader: (state): boolean => state.header !== null,
    hasDictionary: (state): boolean => state.dictionary !== null,
    hasCommandConfig: (state): boolean => state.commandConfig !== null,
    hasMemoryLayout: (state): boolean => state.memoryLayout !== null,
    isReady: (state): boolean => state.header !== null && state.dictionary !== null,
    
    getCommandName: (state) => (commandId: number): string | undefined => {
      return state.dictionary?.commands[commandId];
    },

    getCommandColor: (state) => (commandId: number): string | undefined => {
      return state.commandConfig?.colors[commandId];
    },

    getCommandClockPeriod: (state) => (commandId: number): number | undefined => {
      return state.commandConfig?.clockPeriods[commandId];
    },
  },

  actions: {
    setHeader(header: Header) {
      this.header = header;
    },

    setDictionary(dictionary: Dictionary) {
      this.dictionary = dictionary;
    },

    async setMemoryLayout(memoryLayout: MemoryLayout) {
      const { store } = useBackend();
      this.memoryLayout = memoryLayout; 
      await store.setMemoryLayout(memoryLayout);
    },

    async setCommandConfig(config: CommandConfig) {
      const { store } = useBackend();
      this.commandConfig = config;
      await store.setCommandConfig(config);
    },

    async loadSavedCommandConfig(): Promise<CommandConfig | null> {
      const { store } = useBackend();
      this.commandConfig = await store.getCommandConfig();
      return this.commandConfig;
    },

    async loadSavedMemoryLayout(): Promise<MemoryLayout | null> {
      const { store } = useBackend();
      this.memoryLayout = await store.getMemoryLayout();
      return this.memoryLayout;
    },

    async importConfigFromYaml(): Promise<boolean> {
      const { store } = useBackend();
      const imported = await store.importConfigYaml();
      if (!imported) return false;

      await this.loadSavedCommandConfig();
      await this.loadSavedMemoryLayout();
      return true;
    },

    async close() {
      const { trace } = useBackend()

      this.header = null;
      this.dictionary = null;
      await trace.closeSession();
    },
  },
});