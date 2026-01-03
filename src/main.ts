import { createApp } from "vue";

import { createRouter, createMemoryHistory } from "vue-router";
import { routes, handleHotUpdate } from "vue-router/auto-routes";
import ui from "@nuxt/ui/vue-plugin";

import "./assets/main.css";
import App from "./App.vue";

const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

if (import.meta.hot) {
  handleHotUpdate(router) 
}

createApp(App)
  .use(router)
  .use(ui)
  .mount("#app");
