const CACHE_NAME = 'studyweb-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
    return self.clients.claim();
});

// Network First strategy
self.addEventListener('fetch', (e) => {
    // Only handle GET requests and same origin static files. (We bypass GitHub API calls nicely allowing them to pass through naturally or fail gracefully)
    if (e.request.method !== 'GET') return;
    
    // Ignore external APIs for the service worker cache (so we don't accidentally cache the GitHub API contents which need to be dynamic)
    if (e.request.url.includes('api.github.com')) return;

    e.respondWith(
        fetch(e.request)
            .then(res => {
                // If it's a valid response from our origin or jsdelivr, we could cache it. 
                // But let's only cache our own files aggressively.
                if(e.request.url.startsWith(self.location.origin)) {
                    const cacheRes = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, cacheRes));
                }
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
