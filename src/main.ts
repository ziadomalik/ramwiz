import { createRouter, createMemoryHistory } from "vue-router";
import { createApp } from "vue";

import Home from "./pages/Home.vue";
import App from "./App.vue";

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: Home },
  ],
});

createApp(App).use(router).mount("#app");
