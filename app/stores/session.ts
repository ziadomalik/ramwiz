/// This file defines the store that holds the state of the current session, i.e. the trace that's currently being analyzed.
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----

import { defineStore } from 'pinia';

const COLORS = [
  '#FFCAB1', '#A8D8EA', '#B5EAD7', '#E2B6CF',
  '#C7CEEA', '#FFEAA7', '#DCD6F7', '#F8B595',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F5CBA7', '#AED6F1',
];

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

    getCommandBusLatency: (state) => (commandId: number): number | undefined => {
      return state.commandConfig?.commandBusLatencies[commandId];
    },

    getDataBusLatency: (state) => (commandId: number): number | undefined => {
      return state.commandConfig?.dataBusLatencies[commandId];
    },
  },

  actions: {
    setHeader(header: Header) {
      const toCount = (maxId: number) => Math.max(0, maxId + 1);
      this.header = header;
      this.memoryLayout = {
        numChannels: toCount(header.max_channel_id),
        numRanks: toCount(header.max_rank_id),
        numBankgroups: toCount(header.max_bankgroup_id),
        numBanks: toCount(header.max_bank_id),
      };
    },

    async setDictionary(dictionary: Dictionary) {
      this.dictionary = dictionary;
      this.commandConfig = this.createCommandConfigFromDictionary(dictionary);
      await this.loadSavedCommandColors();
    },

    async loadSavedCommandColors() {
      if (!this.commandConfig) return;

      const { trace } = useBackend();
      const savedColors = await trace.getCommandColors();
      if (!savedColors) return;

      for (const [id, color] of Object.entries(savedColors)) {
        const key = Number(id);
        if (this.commandConfig.colors[key] !== undefined) {
          this.commandConfig.colors[key] = color;
        }
      }
    },

    async persistCommandColors() {
      if (!this.commandConfig) return;
      const { trace } = useBackend();
      await trace.setCommandColors(this.commandConfig.colors);
    },

    async setCommandColor(commandId: number, color: string) {
      if (!this.commandConfig) return;
      this.commandConfig.colors[commandId] = color;
      await this.persistCommandColors();
    },

    async close() {
      const { trace } = useBackend()

      this.header = null;
      this.dictionary = null;
      this.memoryLayout = null;
      this.commandConfig = null;
      await trace.closeSession();
    },

    createCommandConfigFromDictionary(dictionary: Dictionary): CommandConfig {
      const colors: Record<number, string> = {};
      const commandBusLatencies: Record<number, number | undefined> = {};
      const dataBusLatencies: Record<number, number | undefined> = {};

      const sortedIds = Object.keys(dictionary.commands)
        .map(Number)
        .sort((a, b) => a - b);

      sortedIds.forEach((id, index) => {
        colors[id] = COLORS[index % COLORS.length] ?? '#CCCCCC';
        const commandLatency = dictionary.command_bus_latencies[id];
        const dataLatency = dictionary.data_bus_latencies[id];
        commandBusLatencies[id] = commandLatency !== undefined && commandLatency >= 0 ? commandLatency : undefined;
        dataBusLatencies[id] = dataLatency !== undefined && dataLatency >= 0 ? dataLatency : undefined;
      });

      return { colors, commandBusLatencies, dataBusLatencies };
    },
  },
});