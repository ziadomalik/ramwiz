export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  // Tauri-specific configuration //
  ssr: false,
  nitro: {
    output: {
      publicDir: 'dist',
    },
  },
  vite: {
    server: {
      strictPort: true,
    }
  }
})
