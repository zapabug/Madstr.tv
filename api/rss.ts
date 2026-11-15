// Vercel function: same-origin RSS proxy for the deployed app. The dev/preview
// server uses the same code through the middleware in vite.config.ts.
// .js, not bare: on Vercel this runs as plain Node ESM, which needs the extension of the compiled file.
import { handleRssRequest } from '../server/rssProxy.js';

export async function GET(request: Request): Promise<Response> {
  const feedUrl = new URL(request.url).searchParams.get('url');
  const result = await handleRssRequest(feedUrl);
  const body = typeof result.body === 'string' ? result.body : new Uint8Array(result.body);
  return new Response(body, { status: result.status, headers: result.headers });
}
