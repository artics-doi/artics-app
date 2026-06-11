import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icon-192x192.png', 'icon-512x512.png'],
      manifest: {
        name: 'Articsチャット',
        short_name: 'Articsチャット',
        description: '社内チャットアプリ',
        theme_color: '#1a73e8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // firebase-messaging-sw.jsはFCM専用なのでPWAキャッシュから除外
        globIgnores: ['**/firebase-messaging-sw.js'],
        navigateFallbackDenylist: [/^\/firebase-messaging-sw\.js$/],
        // sw.jsではpushイベントを処理しない（firebase-messaging-sw.jsに委譲）
        // 空のpushハンドラを追加して、デフォルトの通知表示を防ぐ
        additionalManifestEntries: [],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              }
            }
          }
        ]
      },
      // injectManifestを使用してカスタムSWでpush通知を無効化
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-custom.ts',
      injectManifest: {
        // firebase-messaging-sw.jsをプリキャッシュから除外
        globIgnores: ['**/firebase-messaging-sw.js']
      },
      // firebase-messaging-sw.jsを別途登録するため、PWAのService Workerと競合しないようにする
      devOptions: {
        enabled: false
      }
    })
  ],
})
