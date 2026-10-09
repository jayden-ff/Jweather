const routes = new Map();
const destinations = new Map();
let lastRequest = 0;
let routingQueue = Promise.resolve();
let lastCategorySearch = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function distanceBetween(a, b) {
    const radians = value => value * Math.PI / 180;
    const lat = radians(b.latitude - a.latitude), lon = radians(b.longitude - a.longitude);
    const angle = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, angle)), Math.sqrt(Math.max(0, 1 - angle)));
}
function point(latitude, longitude, name, id) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude, name: String(name || 'Nearby park').slice(0, 120), id: String(id || '') };
}
export async function nearbyDestinations(place, activity = 'walk') {
    const radius = activity === 'cycle' ? 7000 : 3000;
    const key = place.latitude.toFixed(3) + ',' + place.longitude.toFixed(3) + ':' + radius;
    if (destinations.has(key)) return destinations.get(key);
    const promise = (async () => {
        const query = '[out:json][timeout:15];way[leisure=park](around:' + radius + ',' + place.latitude + ',' + place.longitude + ');out center 20;';
        const url = new URL('https://overpass-api.de/api/interpreter');
        url.search = new URLSearchParams({ data: query });
        let results = [];
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error('Park search unavailable.');
            const data = await response.json();
            results = (data.elements || []).filter(p => !['private', 'no'].includes(p.tags?.access))
                .map(p => point(p.center?.lat ?? p.lat, p.center?.lon ?? p.lon, p.tags?.name, p.id)).filter(Boolean);
        } catch {
            // A bounded, user-initiated category search; never autocomplete Nominatim.
            const latRange = radius / 111000;
            const lonRange = Math.min(1, latRange / Math.max(.15, Math.cos(place.latitude * Math.PI / 180)));
            const url = new URL('https://nominatim.openstreetmap.org/search');
            url.search = new URLSearchParams({ format: 'jsonv2', q: 'park', bounded: '1', limit: '8', 'accept-language': 'en',
                extratags: '1',
                viewbox: [Math.max(-180, place.longitude - lonRange), Math.min(90, place.latitude + latRange), Math.min(180, place.longitude + lonRange), Math.max(-90, place.latitude - latRange)].join(',') });
            await sleep(Math.max(0, 1100 - (Date.now() - lastCategorySearch)));
            lastCategorySearch = Date.now();
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('Nearby places could not load. Choose a destination on the map instead.');
            const data = await response.json();
            results = (Array.isArray(data) ? data : []).filter(p => !['private', 'no'].includes(p.extratags?.access))
                .map(p => point(Number(p.lat), Number(p.lon), p.name || p.display_name?.split(',')[0], p.osm_id)).filter(Boolean);
        }
        return results.filter((p, i, all) => distanceBetween(place, p) >= 200 && distanceBetween(place, p) <= radius
            && all.findIndex(other => other.id === p.id) === i);
    })();
    destinations.set(key, promise);
    try { return await promise; } catch (error) { destinations.delete(key); throw error; }
}
export async function routeTo(place, destination, activity = 'walk') {
    const mode = activity === 'cycle' ? 'bike' : 'foot';
    const key = [place.longitude, place.latitude, destination.longitude, destination.latitude, mode, activity].join(',');
    if (routes.has(key)) return routes.get(key);
    const task = routingQueue.catch(() => {}).then(() => requestRoute(place, destination, activity, mode));
    routingQueue = task;
    routes.set(key, task);
    try { return await task; } catch (error) { routes.delete(key); throw error; }
}
async function requestRoute(place, destination, activity, mode) {
    // Public routing servers ask clients to stay below one request per second.
    await sleep(Math.max(0, 1100 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const waypoints = [[place.longitude, place.latitude], [destination.longitude, destination.latitude], [place.longitude, place.latitude]].map(p => p.join(',')).join(';');
    const url = new URL('https://routing.openstreetmap.de/routed-' + mode + '/route/v1/' + mode + '/' + waypoints);
    url.search = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'false' });
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Routes are unavailable right now. Try another destination.');
    const data = await response.json();
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 100 || route.duration <= 0
        || !Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length < 3) throw new Error('No mapped route was found for this destination.');
    const coordinates = route.geometry.coordinates;
    if (coordinates.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw new Error('The route data was incomplete.');
    // Reject routes snapped far away from the requested places.
    if (!Array.isArray(data.waypoints) || data.waypoints.length !== 3 || data.waypoints.some((p, i) => {
        const target = i === 1 ? destination : place;
        return !Array.isArray(p.location) || !Number.isFinite(p.location[0]) || !Number.isFinite(p.location[1])
            || distanceBetween(target, { longitude: p.location[0], latitude: p.location[1] }) > 700;
    })) throw new Error('No nearby accessible route was found. Try a different point.');
    const result = { name: destination.name, destination, activity, coordinates, distance: route.distance,
        destinationLocation: { longitude: data.waypoints[1].location[0], latitude: data.waypoints[1].location[1] },
        duration: activity === 'run' ? route.distance / (9000 / 3600) : route.duration, source: 'OSRM / FOSSGIS', loop: false };
    return result;
}
export function rankDestinations(place, points, activity, duration) {
    const speed = activity === 'cycle' ? 15000 : activity === 'run' ? 9000 : 4800;
    const desiredDistance = speed * duration / 60 * .7;
    return [...points].sort((a, b) => Math.abs(distanceBetween(place, a) * 2 - desiredDistance) - Math.abs(distanceBetween(place, b) * 2 - desiredDistance)).slice(0, 3);
}
function escapeXML(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}
export function routeGPX(route) {
    const points = route.coordinates.map(([lon, lat]) => '<trkpt lat="' + lat + '" lon="' + lon + '"></trkpt>').join('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Jweather" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' + escapeXML(route.name) + '</name></metadata><trk><name>' + escapeXML(route.name) + '</name><trkseg>' + points + '</trkseg></trk></gpx>';
}
export function directionsURL(place, route) {
    const url = new URL('https://www.google.com/maps/dir/');
    url.search = new URLSearchParams({ api: '1', origin: place.latitude + ',' + place.longitude, destination: place.latitude + ',' + place.longitude,
        waypoints: route.destination.latitude + ',' + route.destination.longitude, travelmode: route.activity === 'cycle' ? 'bicycling' : 'walking' });
    return url.href;
}
