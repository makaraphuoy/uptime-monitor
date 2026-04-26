export default defineNuxtConfig({
  ssr: false,
  devServer: {
    port: parseInt(process.env.PORT || '3000'),
  },
  app: {
    head: {
      titleTemplate: '%s · Uptime Monitor',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [
        { name: 'theme-color', content: '#0f1729' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    },
  },
  future: { compatibilityVersion: 4 },
  components: [
    {
      path: '~/components',
      pathPrefix: false,
    }
  ],
  // Ignore index.ts files in the UI directory to avoid collisions
  ignore: [
    'components/ui/**/*.ts',
    'components/ui/**/index.ts'
  ],
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', 'shadcn-nuxt', '@vueuse/nuxt'],
  shadcn: {
    // prefix: '',
    componentDir: './components/ui'
  },
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: 'tailwind.config.ts'
  },
  css: ['~/assets/css/main.css'],
  nitro: {
    experimental: {
      websocket: false
    }
  },
  vite: {
    optimizeDeps: {
      exclude: ['better-sqlite3']
    }
  },
  compatibilityDate: '2024-11-01'
})
