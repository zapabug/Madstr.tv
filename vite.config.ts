import { defineConfig, Plugin, transformWithEsbuild } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { handleRssRequest } from './server/rssProxy'
import { swSource } from './src/pwa/swSource'

// /api/rss?url=... for feeds that block cross-origin reads (see server/rssProxy.ts).
function rssProxy(): Plugin {
  const middleware = async (
    req: { url?: string; method?: string },
    res: { statusCode: number; setHeader(_name: string, _value: string): void; end(_body?: Buffer | string): void },
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

// sw.js for production builds (spec feat-pwa-zapstore §P1): the app shell of this build (the bundle plus the
// files in public/), a cache name from their hash, and the route rule from src/lib/swRoute.ts.
function serviceWorker(): Plugin {
  const publicFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? publicFiles(path) : ['/' + relative('public', path).split('\\').join('/')]
    })
  return {
    name: 'madstr-service-worker',
    apply: 'build',
    enforce: 'post', // after Vite has written index.html into the bundle, so the page is in the list
    async generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(name => !name.endsWith('.map')).map(name => '/' + name)
      const files = [...new Set(['/', ...built, ...publicFiles('public')])].sort()
      const hash = createHash('sha256')
      for (const name of files) hash.update(name)
      const page = bundle['index.html']
      if (page && page.type === 'asset') hash.update(String(page.source))
      const route = await transformWithEsbuild(readFileSync('src/lib/swRoute.ts', 'utf8'), 'swRoute.ts', { loader: 'ts', format: 'esm' })
      const routeJs = route.code.replace(/^export /gm, '')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(`madstr-${hash.digest('hex').slice(0, 12)}`, files, routeJs) })
    },
  }
}

export default defineConfig({
  plugins: [react(), rssProxy(), serviceWorker()],
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
