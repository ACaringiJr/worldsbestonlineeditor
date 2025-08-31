// coi-serviceworker.js
// Minimal COOP/COEP patch for static hosts (GitHub Pages).
// Adds:  Cross-Origin-Embedder-Policy: require-corp
//        Cross-Origin-Opener-Policy:   same-origin
// See: https://docs.wasmer.io/sdk/wasmer-js/how-to/coop-coep-headers

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only patch same-origin requests; for cross-origin, let the server decide.
  const sameOrigin = new URL(req.url).origin === self.origin || new URL(req.url).origin === self.location.origin;
  event.respondWith((async () => {
    const res = await fetch(req);
    const newHeaders = new Headers(res.headers);
    if (sameOrigin) {
      newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: newHeaders });
  })());
});
