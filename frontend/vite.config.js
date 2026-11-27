import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@undecaf/zbar-wasm']
  },
  plugins: [

    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32x32.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png'],
      manifest: {
        name: 'KaufSync',
        short_name: 'KaufSync',
        title: 'KaufSync',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'portrait',
        shortcuts: [
          {
            name: 'Artikel hinzufügen',
            short_name: 'Hinzufügen',
            description: 'Direkt einen Artikel zur zuletzt geöffneten Liste hinzufügen',
            url: '/?shortcut=add',
            icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Barcode scannen',
            short_name: 'Scannen',
            description: 'Direkt den Barcode-Scanner öffnen',
            url: '/?shortcut=scan',
            icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Rezept importieren',
            short_name: 'Rezept',
            description: 'Zutaten per Link oder Text importieren',
            url: '/?shortcut=recipe',
            icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        share_target: {
          action: '/share-target',
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        },
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      }
    }
  }
});