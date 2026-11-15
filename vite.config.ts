import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleRssRequest } from './server/rssProxy'

// /api/rss?url=... for feeds that block cross-origin reads (see server/rssProxy.ts).
function rssProxy(): Plugin {
  const middleware = async (
    req: { url?: string; method?: string },
    res: { statusCode: number; setHeader(name: string, value: string): void; end(body?: Buffer | string): void },
    next: () => void,
  ) => {
    if (!req.url || !req.url.startsWith('/api/rss')) return next()
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end('Method not allowed')
    }
    const feedUrl = new URL(req.url, 'http://localhost').searchParams.get('url')
    const result = await handleRssRequest(feedUrl)
    res.statusCode = result.status
    for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
    res.end(result.body)
  }
  return {
    name: 'rss-proxy',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

export default defineConfig({
  plugins: [react(), rssProxy()],
  server: {
    port: 3000
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'EVAL') return
        warn(warning)
      }
    }
  }
})
