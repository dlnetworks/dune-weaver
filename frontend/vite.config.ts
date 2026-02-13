import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

// Read backend API configuration from main.py
function getBackendConfig(): { host: string; port: number } {
  try {
    const mainPyPath = path.join(__dirname, '..', 'main.py')
    const content = fs.readFileSync(mainPyPath, 'utf-8')

    // Look for uvicorn.run with host and port
    const hostMatch = content.match(/uvicorn\.run\([^)]*host\s*=\s*["']([^"']+)["']/)
    const portMatch = content.match(/uvicorn\.run\([^)]*port\s*=\s*(\d+)/)

    if (hostMatch && portMatch) {
      let host = hostMatch[1]
      const port = parseInt(portMatch[1])

      // If backend binds to 0.0.0.0, frontend should connect to 127.0.0.1
      if (host === '0.0.0.0') {
        host = '127.0.0.1'
      }

      console.log(`Read backend config from main.py: ${host}:${port}`)
      return { host, port }
    }
  } catch (err) {
    console.warn('Could not read backend config from main.py:', err)
  }

  // Fallback to defaults
  console.log('Using fallback backend config: 127.0.0.1:8080')
  return { host: '127.0.0.1', port: 8080 }
}

const backendConfig = getBackendConfig()

// Backend API configuration - can be overridden via environment variables
// VITE_API_HOST and VITE_API_PORT take precedence over auto-detected values
const API_HOST = process.env.VITE_API_HOST || backendConfig.host
const API_PORT = parseInt(process.env.VITE_API_PORT || backendConfig.port.toString())
const API_BASE_HTTP = `http://${API_HOST}:${API_PORT}`
const API_BASE_WS = `ws://${API_HOST}:${API_PORT}`

// Create custom logger that filters network messages
const logger = createLogger()
const originalInfo = logger.info
logger.info = (msg, options) => {
  // Filter out unwanted network address messages
  if (msg.includes('➜  Local:') || msg.includes('➜  Network:')) {
    // Only show the configured IP
    if (!msg.includes(API_HOST)) {
      return
    }
  }
  originalInfo(msg, options)
}

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  customLogger: logger,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png'],
      manifest: false, // We use our own manifest at /static/site.webmanifest
      workbox: {
        // Cache static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Runtime caching rules
        runtimeCaching: [
          {
            // Cache pattern preview images
            urlPattern: /\/static\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pattern-previews',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache static assets from backend
            urlPattern: /\/static\/.*\.(png|jpg|ico|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            // Network-first for API calls (always want fresh data, but cache as fallback)
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable in dev mode to avoid caching issues
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    host: API_HOST, // Listen only on specific IP
    strictPort: true,
    allowedHosts: true, // Allow all hosts for local network development
    proxy: {
      // WebSocket endpoints
      '/ws': {
        target: API_BASE_WS,
        ws: true,
        // Suppress connection errors (common during backend restarts)
        configure: (proxy, _options) => {
          // Handle proxy errors silently for expected connection issues
          const isConnectionError = (err: Error & { code?: string }) => {
            const msg = err.message || ''
            const code = err.code || ''
            // Check error code (most reliable for AggregateError)
            if (['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT'].includes(code)) {
              return true
            }
            // Check message as fallback
            if (msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED') ||
                msg.includes('EPIPE') || msg.includes('ETIMEDOUT') ||
                msg.includes('AggregateError')) {
              return true
            }
            return false
          }

          const handleError = (err: Error) => {
            if (isConnectionError(err)) {
              return // Silently ignore connection errors
            }
            // Only log unexpected errors
            console.error('WebSocket proxy error:', err.message)
          }

          proxy.on('error', handleError)
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              if (!isConnectionError(err)) {
                console.error('WebSocket socket error:', err.message)
              }
            })
          })
        },
      },
      // All /api endpoints
      '/api': API_BASE_HTTP,
      // Static assets
      '/static': API_BASE_HTTP,
      // Preview images
      '/preview': API_BASE_HTTP,
      // Legacy root-level API endpoints (for backwards compatibility)
      // Pattern execution
      '/send_home': API_BASE_HTTP,
      '/send_coordinate': API_BASE_HTTP,
      '/stop_execution': API_BASE_HTTP,
      '/force_stop': API_BASE_HTTP,
      '/soft_reset': API_BASE_HTTP,
      '/controller_restart': API_BASE_HTTP,
      '/pause_execution': API_BASE_HTTP,
      '/resume_execution': API_BASE_HTTP,
      '/skip_pattern': API_BASE_HTTP,
      '/reorder_playlist': API_BASE_HTTP,
      '/add_to_queue': API_BASE_HTTP,
      '/run_theta_rho': API_BASE_HTTP,
      '/run_playlist': API_BASE_HTTP,
      // Movement
      '/move_to_center': API_BASE_HTTP,
      '/move_to_perimeter': API_BASE_HTTP,
      // Speed
      '/set_speed': API_BASE_HTTP,
      // Connection
      '/serial_status': API_BASE_HTTP,
      '/list_serial_ports': API_BASE_HTTP,
      '/connect': API_BASE_HTTP,
      '/disconnect': API_BASE_HTTP,
      '/recover_sensor_homing': API_BASE_HTTP,
      // Patterns
      '/list_theta_rho_files': API_BASE_HTTP,
      '/list_theta_rho_files_with_metadata': API_BASE_HTTP,
      '/preview_thr': API_BASE_HTTP,
      '/preview_thr_batch': API_BASE_HTTP,
      '/get_theta_rho_coordinates': API_BASE_HTTP,
      '/delete_theta_rho_file': API_BASE_HTTP,
      '/upload_theta_rho': API_BASE_HTTP,
      // Playlists
      '/list_all_playlists': API_BASE_HTTP,
      '/get_playlist': API_BASE_HTTP,
      '/create_playlist': API_BASE_HTTP,
      '/modify_playlist': API_BASE_HTTP,
      '/delete_playlist': API_BASE_HTTP,
      '/rename_playlist': API_BASE_HTTP,
      '/add_to_playlist': API_BASE_HTTP,
      // LED
      '/get_led_config': API_BASE_HTTP,
      '/set_led_config': API_BASE_HTTP,
    },
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
})
