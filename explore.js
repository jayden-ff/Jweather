import { el, button, externalLink, placeURL } from './ui.js?v=20261008.5';
import { nearbyDestinations, rankDestinations, routeTo, routeGPX, directionsURL, distanceBetween } from './route-service.js?v=20261008.5';
import { savePlan, hasPersistentStorage } from './personal-store.js?v=20261008.5';
import { activities, clockTime, localParts, dayLabel } from './activity-engine.js?v=20261008.5';
let leaflet;
function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!leaflet) leaflet = new Promise((resolve, reject) => {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('assets/vendor/leaflet/leaflet.css', import.meta.url).href; document.head.append(css);
        const script = document.createElement('script'); script.src = new URL('assets/vendor/leaflet/leaflet.js', import.meta.url).href;
        script.onload = () => resolve(window.L);
        script.onerror = () => { leaflet = null; reject(new Error('The map could not load. Please try again.')); };
        document.head.append(script);
    });
    return leaflet;
}
export function createExplorer(container, getContext) {
    let map, L, origin, routeLayer, markers;
    let mode = getContext()?.window?.activity === 'cycle' ? 'cycle' : getContext()?.window?.activity === 'run' ? 'run' : 'walk';
    let busy = false, selecting = '', initialized = false, generation = 0;
    const header = el('div', 'explore-heading');
    header.append(el('h3', '', 'A little change of scenery.'), el('p', 'journey-note', 'Nearby parks, real paths, and a way back.'));
    const moment = el('p', 'map-moment'); moment.setAttribute('role', 'status');
    header.append(moment);
    const toolbar = el('div', 'map-toolbar');
    const modes = el('div', 'route-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Route activity');
    const modeButtons = [];
    for (const [value, text] of [['walk', 'Walk'], ['run', 'Run'], ['cycle', 'Cycle']]) {
        const choice = button(text, 'quiet-button', () => {
            if (busy) return;
            mode = value; syncModes();
            window.dispatchEvent(new CustomEvent('jweather:activity', { detail: value }));
            findRoutes();
        });
        choice.setAttribute('aria-pressed', String(value === mode)); modes.append(choice); modeButtons.push(choice);
    }
    const start = button('Set start on map', 'quiet-button', () => { selecting = 'start'; status.textContent = 'Tap a point on the map for your starting place.'; });
    const target = button('Choose destination', 'quiet-button', () => { selecting = 'destination'; status.textContent = 'Tap a destination on the map, or choose a nearby park below.'; });
    toolbar.append(modes, start, target);
    const stage = el('div', 'map-stage'); stage.id = 'outdoor-map'; stage.setAttribute('aria-label', 'Map with suggested walking and cycling routes');
    const status = el('p', 'journey-status'); status.setAttribute('role', 'status');
    const caption = el('p', 'journey-note', 'Routes start near the selected place. Distances follow mapped paths. Estimated moving times exclude stops.');
    const list = el('div', 'route-list');
    container.append(header, toolbar, stage, status, list, caption);
    function syncModes() { modeButtons.forEach(choice => choice.setAttribute('aria-pressed', String(choice.textContent.toLowerCase() === mode))); }
    function setBusy(value) { busy = value; modeButtons.forEach(b => b.disabled = value); start.disabled = value; target.disabled = value; }
    async function initialize() {
        update();
        if (!navigator.onLine) { status.textContent = 'Maps and routes need a connection. Your saved plans and forecasts remain available.'; return; }
        if (initialized) { requestAnimationFrame(() => map?.invalidateSize()); return; }
        initialized = true;
        try {
            L = await loadLeaflet();
            const context = getContext();
            origin = { ...context.place };
            map = L.map(stage, { scrollWheelZoom: false, keyboard: true }).setView([origin.latitude, origin.longitude], 13);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            }).on('tileerror', () => { if (!navigator.onLine) status.textContent = 'Maps need a connection. Your saved plans and forecasts remain available.'; }).addTo(map);
            markers = L.layerGroup().addTo(map);
            drawOrigin();
            map.on('click', event => {
                if (!selecting || busy) return;
                const selected = { latitude: event.latlng.lat, longitude: event.latlng.lng, name: selecting === 'start' ? 'Your starting point' : 'Your destination' };
                if (selecting === 'start') {
                    if (distanceBetween(getContext().place, selected) > 20000) { status.textContent = 'Choose a start within 20 km of the forecast location, or search for a different place.'; return; }
                    origin = selected; selecting = ''; findRoutes();
                } else {
                    if (distanceBetween(origin, selected) > 20000) { status.textContent = 'Choose a nearby destination within 20 km.'; return; }
                    selecting = ''; findCustom(selected);
                }
            });
            await findRoutes();
        } catch (error) {
            initialized = false; status.textContent = error.message; list.replaceChildren(button('Try the map again ↗', 'quiet-button', initialize));
        }
    }
    function drawOrigin() {
        if (!markers) return;
        markers.clearLayers();
        L.circleMarker([origin.latitude, origin.longitude], { pane: 'markerPane', className: 'route-origin', radius: 6, color: '#a66535', fillColor: '#f3f0e9', fillOpacity: 1, weight: 2 }).bindTooltip(el('span', '', origin.name)).addTo(markers);
    }
    async function findRoutes() {
        if (!map || busy) return;
        const sequence = ++generation;
        setBusy(true); list.replaceChildren(); status.textContent = 'Finding nearby parks and paths …'; drawOrigin();
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        try {
            const context = getContext();
            const points = rankDestinations(origin, await nearbyDestinations(origin, mode), mode, context.window?.duration || 60);
            if (!points.length) { status.textContent = 'No nearby parks were found. Choose a destination on the map instead.'; return; }
            const successes = [];
            for (const point of points.slice(0, 2)) {
                try {
                    const route = await routeTo(origin, point, mode);
                    if (sequence !== generation) return;
                    successes.push(route);
                    addCard(route, successes.length === 1);
                    if (successes.length === 1) showRoute(route);
                } catch { /* A different mapped destination can still work. */ }
            }
            status.textContent = successes.length ? 'Choose a route below. Paths from OpenStreetMap; check access and local conditions.'
                : 'No mapped route could be found. Choose another destination, or try again.';
            if (!successes.length) list.append(button('Try routes again ↻', 'quiet-button', findRoutes));
        } catch (error) { status.textContent = error.message; list.append(button('Try routes again ↻', 'quiet-button', findRoutes)); }
        finally { setBusy(false); }
    }
    async function findCustom(destination) {
        setBusy(true); status.textContent = 'Finding a mapped path to your destination …';
        try {
            const route = await routeTo(origin, destination, mode);
            list.replaceChildren(); addCard(route, true); showRoute(route); status.textContent = 'An out-and-back route. Check access and local conditions.';
        } catch (error) { status.textContent = error.message; } finally { setBusy(false); }
    }
    function showRoute(route) {
        if (routeLayer) map.removeLayer(routeLayer);
        const feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } };
        const casing = L.geoJSON(feature, { interactive: false, style: { color: '#f3f0e9', weight: 8, opacity: .9 } });
        const line = L.geoJSON(feature, {
            style: { color: '#c17b40', weight: 4, opacity: .9, className: 'route-line' }
        });
        routeLayer = L.featureGroup([casing, line]).addTo(map);
        line.eachLayer(layer => layer.getElement()?.setAttribute('pathLength', '1'));
        drawOrigin();
        L.circleMarker([route.destinationLocation.latitude, route.destinationLocation.longitude], { pane: 'markerPane', radius: 5,
            color: '#f3f0e9', fillColor: '#a66535', fillOpacity: 1, weight: 2 }).bindTooltip(el('span', '', route.name)).addTo(markers);
        map.fitBounds(routeLayer.getBounds(), { padding: [25, 25], maxZoom: 15, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
        list.querySelectorAll('.route-card').forEach(card => card.dataset.selected = String(card.dataset.routeKey === String(route.destination.id || [route.destination.latitude, route.destination.longitude].join(','))));
    }
    function addCard(route, selected) {
        const card = el('article', 'route-card'); card.dataset.routeKey = String(route.destination.id || [route.destination.latitude, route.destination.longitude].join(',')); card.dataset.selected = String(selected);
        const choose = button('', 'route-select', () => showRoute(route));
        choose.append(el('span', 'eyebrow', 'Out and back'), el('h4', '', route.name),
            el('span', 'route-distance', (route.distance / 1000).toFixed(1) + ' km · about ' + Math.ceil(route.duration / 60) + ' min'));
        const actions = el('div', 'route-actions');
        actions.append(externalLink('Directions ↗', directionsURL(origin, route), 'quiet-button'),
            button('Download GPX ↓', 'quiet-button', () => {
                const url = URL.createObjectURL(new Blob([routeGPX(route)], { type: 'application/gpx+xml' }));
                const link = el('a'); link.href = url; link.download = 'jweather-route.gpx'; document.body.append(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }));
        const context = getContext();
        if (context.window && route.activity === context.window.activity && route.duration <= context.window.duration * 60 && distanceBetween(context.place, origin) <= 10000) {
            actions.append(button('Save weather window', 'quiet-button', () => {
                const latest = getContext();
                if (!latest.window || route.activity !== latest.window.activity || route.duration > latest.window.duration * 60) { status.textContent = 'Choose a matching activity and a long enough weather window for this route.'; return; }
                try { savePlan(latest.window, latest.place); status.textContent = hasPersistentStorage() ? 'The weather window is saved to your plans. Download the GPX to keep the route.' : 'Weather window saved for this visit.'; }
                catch (error) { status.textContent = error.message; }
            }));
        } else if (context.window) card.append(el('p', 'journey-note', 'Choose a matching activity and enough time if you plan to follow this route.'));
        card.append(choose, actions); list.append(card);
    }
    function update() {
        const context = getContext();
        if (!context?.window) { moment.textContent = 'Choose a weather window above to make it a plan.'; return; }
        const window = context.window;
        const today = localParts(Date.now(), window.zone).slice(0, 10);
        moment.textContent = activities[window.activity].label + ' · ' + dayLabel(window.date, today) + ' · '
            + clockTime(window.start, window.zone) + '–' + clockTime(window.end, window.zone) + ' · ' + window.duration + ' minutes to spare';
    }
    return { open: initialize, update };
}
