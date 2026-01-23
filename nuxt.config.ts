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
  devServer: {
    host: '127.0.0.1',
    port: 3000
  },
  nitro: {
    output: {
      publicDir: 'dist',
    },
  },
  vite: {
    clearScreen: false,
    server: {
      strictPort: true,
      hmr: {
        protocol: 'ws',
        host: '127.0.0.1',
        port: 3000,
      }
    }
  },
  ignore: ['**/src-tauri/**'],
})