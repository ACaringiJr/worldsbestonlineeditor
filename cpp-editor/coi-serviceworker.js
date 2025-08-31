// coi-serviceworker.js
// Minimal COOP/COEP service worker for GitHub Pages.

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

const shouldAugment = (request, response) => {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;

    const dest = request.destination; // 'document','script','style','worker','sharedworker', etc.
    if (dest === 'document' || dest === 'script' || dest === 'worker' || dest === 'sharedworker' || dest === 'style') return true;

    const ct = response.headers.get('content-type') || '';
    if (/\b(text\/html|application\/wasm|text\/javascript|application\/javascript|text\/css|application\/json)\b/i.test(ct)) return true;

    return false;
  } catch { return false; }
};

const addHeaders = (response) => {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
  newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  if (!newHeaders.has('Cross-Origin-Resource-Policy')) {
    newHeaders.set('Cross-Origin-Resource-Policy', 'same-origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const isRange = request.headers.has('range');

  event.respondWith((async () => {
    const response = await fetch(request);
    if (isRange) return response;
    try {
      if (shouldAugment(request, response)) return addHeaders(response);
    } catch {}
    return response;
  })());
});
