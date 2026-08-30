// خادم التطوير المحلي فقط؛ الاسم يتجنب اكتشافه كخادم إنتاج تلقائيًا في Vercel.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSummarizeRequest } from './src/summarize-handler.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 50_000;
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);
const STATIC_FILES = new Set([
  '/index.html',
  '/manifest.json',
  '/cloud-sync.js',
  '/service-worker.js',
  '/apple-touch-icon.png',
  '/styles/main.css',
  '/src/client/app.js',
  '/src/client/state.js',
  '/src/client/actions.js',
  '/src/client/render.js',
  '/src/client/search.js',
  '/src/client/io.js',
  '/src/client/summarize.js',
  '/src/client/toast.js',
  '/src/client/modal.js',
  '/src/client/backup.js'
]);

function applySecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'"
  ].join('; '));
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RangeError('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function webHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '));
    else if (value != null) headers.set(name, String(value));
  }
  return headers;
}

function clientId(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket.remoteAddress || 'anonymous';
}

async function serveApi(request, response, url) {
  let body;
  try {
    body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
  } catch (error) {
    response.statusCode = error instanceof RangeError ? 413 : 400;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'الطلب أكبر من الحد المسموح.' }));
    return;
  }

  const webRequest = new Request(url, {
    method: request.method,
    headers: webHeaders(request),
    body
  });
  const webResponse = await handleSummarizeRequest(webRequest, {
    clientId: clientId(request)
  });

  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

async function serveStatic(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.end('Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.statusCode = 400;
    response.end('Bad Request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  if (!STATIC_FILES.has(pathname) && !/^\/icons\/icon-\d+\.png$/.test(pathname)) {
    response.statusCode = 404;
    response.end('Not Found');
    return;
  }
  if (pathname.split('/').some(part => part.startsWith('.'))) {
    response.statusCode = 404;
    response.end('Not Found');
    return;
  }

  const filePath = resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not_a_file');
    const content = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('Cache-Control', pathname === '/service-worker.js' ? 'no-cache' : 'no-cache, must-revalidate');
    response.setHeader('Content-Length', content.length);
    response.setHeader('Content-Type', MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream');
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  } catch {
    response.statusCode = 404;
    response.end('Not Found');
  }
}

export const server = createServer(async (request, response) => {
  applySecurityHeaders(response);
  const host = request.headers.host || 'localhost';
  const protocol = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const url = new URL(request.url || '/', `${protocol}://${host}`);

  try {
    if (url.pathname === '/api/summarize') {
      await serveApi(request, response, url);
    } else if (url.pathname.startsWith('/api/')) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'المسار غير موجود.' }));
    } else {
      await serveStatic(request, response, url);
    }
  } catch (error) {
    console.error('Request failed.', { name: error?.name || 'Error' });
    if (!response.headersSent) response.statusCode = 500;
    if (!response.writableEnded) response.end('Internal Server Error');
  }
});

const port = Number.parseInt(process.env.PORT || '3000', 10);
server.listen(Number.isFinite(port) ? port : 3000, '0.0.0.0', () => {
  console.log(`3bot Note is running on http://localhost:${Number.isFinite(port) ? port : 3000}`);
});
