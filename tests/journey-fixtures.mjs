import { fixture } from './fixtures.mjs';
export const now = Date.parse('2026-10-08T12:15:00Z');
export const berlin = { latitude: 52.52, longitude: 13.405, name: 'Berlin', country: 'Germany', admin1: 'Berlin' };
export const placePath = 'weather.html?lat=52.52&lon=13.405&name=Berlin&country=Germany';
export function forecast() {
    const data = structuredClone(fixture);
    for (const key of Object.keys(data.hourly)) data.hourly[key] = key === 'time'
        ? Array.from({ length: 144 }, (_, i) => `2026-10-${String(8 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`)
        : Array(144).fill(data.hourly[key][0]);
    return data;
}
export const parks = { elements: [
    { id: 101, center: { lat: 52.525, lon: 13.397 }, tags: { name: 'A quiet park', leisure: 'park' } },
    { id: 102, center: { lat: 52.527, lon: 13.394 }, tags: { name: 'A second park', leisure: 'park' } },
    { id: 103, center: { lat: 52.53, lon: 13.39 }, tags: { name: 'Private gardens', leisure: 'park', access: 'private' } }
] };
export function routeFixture(url) {
    const matches = new URL(url).pathname.split('/').at(-1).split(';').map(pair => pair.split(',').map(Number));
    const [start, destination, end] = matches;
    return { code: 'Ok', waypoints: matches.map(location => ({ location })), routes: [{ distance: 2500, duration: 1800,
        geometry: { type: 'LineString', coordinates: [start, [start[0] - .003, start[1] + .001], destination, [start[0] - .003, start[1] + .001], end] } }] };
}
