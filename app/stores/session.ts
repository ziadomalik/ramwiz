/// This file defines the store that holds the state of the current session, i.e. the trace that's currently being analyzed.
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----

import { defineStore } from 'pinia';
import type { Header, Dictionary } from '@/lib/backend';
import { closeSessionHandler } from '@/lib/backend';

export const useSessionStore = defineStore('session', {
  state: () => ({
    header: null as Header | null,
    dictionary: null as Dictionary | null,
  }),

  getters: {
    hasHeader: (state): boolean => state.header !== null,
    hasDictionary: (state): boolean => state.dictionary !== null,
    isReady: (state): boolean => state.header !== null && state.dictionary !== null,
    
    getCommandName: (state) => (commandId: number): string | undefined => {
      return state.dictionary?.commands[commandId];
    },
  },

  actions: {
    setHeader(header: Header) {
      this.header = header;
    },

    setDictionary(dictionary: Dictionary) {
      this.dictionary = dictionary;
    },

    async close() {
      this.header = null;
      this.dictionary = null;
      await closeSessionHandler();
    },
  },
});