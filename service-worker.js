/* Only the app shell and public forecast responses are kept offline. */
const VERSION = '20261008.5';
const SHELL = 'jweather-shell-' + VERSION;
const FORECASTS = 'jweather-forecasts-v1';
const ROOT = new URL('./', self.location.href);
const FILES = [
    './', 'index.html', 'weather.html', 'weather.css', 'activities.css', 'journey.css',
    'theme.js', 'weather.js', 'activities.js', 'activity-engine.js', 'calendar.js', 'calendar-config.js',
    'journey.js', 'app.js', 'ui.js', 'personal-store.js', 'forecast-api.js', 'place-picker.js', 'profile.js',
    'myday.js', 'plans.js', 'share-plan.js', 'route-service.js', 'explore.js', 'compare.js', 'manifest.webmanifest',
    'assets/favicon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png',
    'assets/fonts/dm-sans-regular.ttf', 'assets/fonts/dm-sans-medium.ttf', 'assets/fonts/dm-sans-semibold.ttf',
    'assets/fonts/instrument-serif-regular.ttf', 'assets/fonts/instrument-serif-italic.ttf',
    'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css',
    'assets/vendor/leaflet/images/layers.png', 'assets/vendor/leaflet/images/layers-2x.png',
    'assets/vendor/leaflet/images/marker-icon.png', 'assets/vendor/leaflet/images/marker-icon-2x.png', 'assets/vendor/leaflet/images/marker-shadow.png'
];
const paths = new Set(FILES.map(file => new URL(file, ROOT).pathname));
function isForecast(url) {
    return url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast'
        && ['latitude', 'longitude'].every(key => url.searchParams.has(key) && Number.isFinite(Number(url.searchParams.get(key))))
        && Math.abs(Number(url.searchParams.get('latitude'))) <= 90 && Math.abs(Number(url.searchParams.get('longitude'))) <= 180;
}
function validForecast(data) {
    return data && !data.error && typeof data.timezone === 'string' && typeof data.current?.time === 'string'
        && Array.isArray(data.hourly?.time) && data.hourly.time.length > 0 && Array.isArray(data.daily?.time) && data.daily.time.length > 0;
}
let writes = Promise.resolve();
function storeForecast(url, data, savedAt) {
    writes = writes.catch(() => {}).then(async () => {
        if (!validForecast(data) || !Number.isFinite(Date.parse(savedAt))) return;
        const cache = await caches.open(FORECASTS);
        const existing = await cache.match(url);
        if (existing && Date.parse(existing.headers.get('X-Jweather-Saved-At')) > Date.parse(savedAt)) return;
        const headers = { 'Content-Type': 'application/json', 'X-Jweather-Saved-At': savedAt };
        await cache.put(url, new Response(JSON.stringify(data), { headers }));
        const keys = await cache.keys();
        for (const key of keys.slice(0, Math.max(0, keys.length - 20))) await cache.delete(key);
    });
    return writes;
}
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        await Promise.all(FILES.map(async file => {
            const url = new URL(file, ROOT).href;
            const response = await fetch(url, { cache: 'reload' });
            if (!response.ok) throw new Error('App shell unavailable.');
            await cache.put(url, response);
        }));
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) if (key.startsWith('jweather-shell-') && key !== SHELL) await caches.delete(key);
        await self.clients.claim();
    })());
});
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') { event.waitUntil(self.skipWaiting()); return; }
    if (event.data?.type !== 'CACHE_FORECAST' || !event.source?.url || new URL(event.source.url).origin !== ROOT.origin) return;
    try {
        const url = new URL(event.data.url);
        if (isForecast(url) && !event.data.data?._jweather?.cached) event.waitUntil(storeForecast(url.href, event.data.data, event.data.savedAt)
            .then(() => event.ports[0]?.postMessage({ type: 'FORECAST_CACHED' })));
    } catch { /* Ignore malformed messages. */ }
});
async function forecastResponse(request) {
    try {
        const response = await fetch(request, { signal: AbortSignal.timeout(7000) });
        if (!response.ok) throw new Error('Forecast unavailable.');
        const data = await response.clone().json();
        if (!validForecast(data)) throw new Error('Incomplete forecast.');
        const savedAt = new Date().toISOString();
        await storeForecast(request.url, data, savedAt);
        return response;
    } catch {
        const cached = await (await caches.open(FORECASTS)).match(request.url);
        if (!cached) return Response.error();
        const headers = new Headers(cached.headers);
        headers.set('X-Jweather-Offline', '1');
        return new Response(await cached.arrayBuffer(), { status: 200, headers });
    }
}
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || request.headers.has('Authorization')) return;
    const url = new URL(request.url);
    if (isForecast(url)) { event.respondWith(forecastResponse(request)); return; }
    if (url.origin !== ROOT.origin || !paths.has(url.pathname)) return;
    // Callback URLs, OAuth endpoints, map tiles and route data never enter these caches.
    event.respondWith((async () => {
        const cache = await caches.open(SHELL);
        const cached = await cache.match(new URL(url.pathname, ROOT.origin).href);
        return cached || fetch(request);
    })());
});
