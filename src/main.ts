import { createRouter, createMemoryHistory } from "vue-router";
import { routes, handleHotUpdate } from 'vue-router/auto-routes';
import { createApp } from "vue";

import App from "./App.vue";

const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

if (import.meta.hot) {
  handleHotUpdate(router) 
}

createApp(App).use(router).mount("#app");
