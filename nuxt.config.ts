export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/google-fonts'
  ],
  css: ['~/assets/css/main.css'],

  googleFonts: {
    families: {
      'JetBrains Mono': true,
    },
  },

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