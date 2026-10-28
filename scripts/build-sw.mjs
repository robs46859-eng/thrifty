import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets'))
  .filter((f) => /\.(js|css|woff2?)$/.test(f))
  .map((f) => `/assets/${f}`);
const files = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  ...assets,
];
const hash = createHash('sha256');
for (const file of files.filter((f) => f !== '/')) hash.update(await readFile(`dist${file}`));
const version = hash.digest('hex').slice(0, 16);
await writeFile(
  'dist/sw.js',
  `const CACHE = 'thrifty-shell-${version}';\nconst FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('thrifty-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
 if (event.request.mode === 'navigate') {
  event.respondWith(fetch(event.request).then(response => {
   if (response.ok && response.headers.get('content-type')?.includes('text/html')) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put('/index.html', copy))); }
   return response;
  }).catch(() => caches.match('/index.html'))); return;
 }
 if (FILES.includes(url.pathname)) event.respondWith(caches.match(url.pathname).then(cached => cached || fetch(event.request)));
});\n`,
);
console.log(
  `Offline shell generated (${version}, ${files.length} files). APIs and photos are never cached.`,
);
