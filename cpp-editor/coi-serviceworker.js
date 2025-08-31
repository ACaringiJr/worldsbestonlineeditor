// coi-serviceworker.js
// Minimal COOP/COEP service worker for GitHub Pages.
// Scope rule: the SW can only control paths at or below its own directory.
// Put it at "/" for whole-origin coverage, or in your project folder for per-project.

self.addEventListener('install', (e) => {
  // Activate immediately
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  // Take control of all clients under scope immediately
  e.waitUntil(self.clients.claim());
});

// Which requests should we wrap with COOP/COEP?
const shouldAugment = (request, response) => {
  // Only same-origin responses can be rewrapped.
  try {
    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin) return false;

    // Only for document & static assets we serve (html/js/wasm/css/json).
    const dest = request.destination; // 'document', 'script', 'style', 'worker', 'sharedworker', 'audio', 'video', 'image', 'font'
    if (dest === 'document' || dest === 'script' || dest === 'worker' || dest === 'sharedworker' || dest === 'style') return true;

    // Fallback on content-type sniff
    const ct = response.headers.get('content-type') || '';
    if (/\b(text\/html|application\/wasm|text\/javascript|application\/javascript|text\/css|application\/json)\b/i.test(ct)) return true;

    return false;
  } catch { return false; }
};

const addHeaders = (response) => {
  const newHeaders = new Headers(response.headers);

  // Set COOP/COEP for cross-origin isolation
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
  newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

  // Helpful for modules/workers when used cross-origin (doesn't fix 3P sites without CORS/CORP)
  // We only set CORP for our own responses; cross-origin assets must provide CORS/CORP themselves.
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

  // Let range requests/images pass through unmodified to avoid issues.
  const isRange = request.headers.has('range');

  event.respondWith((async () => {
    const response = await fetch(request);
    if (isRange) return response;

    try {
      if (shouldAugment(request, response)) {
        return addHeaders(response);
      }
    } catch (e) {
      // If anything goes wrong, fall back to original response.
    }
    return response;
  })());
});
