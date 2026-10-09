import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWindows, checkPlan, localParts } from '../activity-engine.js';
import { sanitizeState, validPlace } from '../personal-store.js';
import { readSharedPlan, sharedPlanURL } from '../share-plan.js';
import { comparisonDates } from '../compare.js';
import { distanceBetween, routeGPX, directionsURL, routeTo } from '../route-service.js';
import { forecast, berlin, now, routeFixture } from './journey-fixtures.mjs';

test('personal recommendations respect weekdays and the entire free-time interval', () => {
    const result = findWindows(forecast(), { now, duration: 90, earliest: '16:00', latest: '18:00', weekdays: [5], horizonHours: 144 });
    assert.ok(result.windows.length);
    for (const window of result.windows) {
        assert.equal(window.date, '2026-10-09');
        assert.ok(localParts(window.start, window.zone).slice(11, 16) >= '16:00');
        assert.ok(localParts(window.end, window.zone).slice(11, 16) <= '18:00');
    }
    assert.equal(findWindows(forecast(), { now, duration: 90, earliest: '16:00', latest: '17:00' }).windows.length, 0);
});
test('destination comparison includes later weekend days but never substitutes a different date', () => {
    const dates = comparisonDates('2026-10-08', 'weekend');
    assert.deepEqual(dates, ['2026-10-10', '2026-10-11']);
    const result = findWindows(forecast(), { now, dates, horizonHours: 144 });
    assert.ok(result.windows.length);
    assert.ok(result.windows.every(window => dates.includes(window.date)));
    assert.equal(findWindows(forecast(), { now, dates: ['2026-10-18'], horizonHours: 144 }).windows.length, 0);
    assert.deepEqual(comparisonDates('2026-10-11', 'weekend'), ['2026-10-11']);
    assert.deepEqual(comparisonDates('2026-12-31', 'tomorrow'), ['2027-01-01']);
});
test('saved plans detect storms in any part of the selected time and missing readings', () => {
    const data = forecast();
    const plan = findWindows(data, { now, duration: 90 }).windows[0];
    assert.equal(checkPlan(data, plan, now).status, 'good');
    data.hourly.weather_code[15] = 95;
    assert.equal(checkPlan(data, plan, now).status, 'changed');
    assert.match(checkPlan(data, plan, now).message, /Thunderstorms/);
    data.hourly.weather_code[15] = 0;
    data.hourly.wind_gusts_10m[15] = null;
    assert.equal(checkPlan(data, plan, now).status, 'unavailable');
});
test('cached, elapsed and out-of-range plans never masquerade as a fresh good fit', () => {
    const data = forecast();
    const plan = findWindows(data, { now }).windows[0];
    assert.equal(checkPlan({ ...data, _jweather: { cached: true } }, plan, now).status, 'offline');
    assert.equal(checkPlan(data, plan, plan.end).status, 'past');
    assert.equal(checkPlan(data, plan, plan.start).status, 'ongoing');
    assert.equal(checkPlan(data, { ...plan, start: plan.start + 14 * 86400000, end: plan.end + 14 * 86400000 }, now).status, 'unavailable');
});
test('corrupt local records are bounded, deduplicated and stripped of credentials', () => {
    const window = findWindows(forecast(), { now }).windows[0];
    const good = { ...window, id: 'local-plan', place: berlin, calendar: { provider: 'google', id: 'event-1', accessToken: 'secret' } };
    const state = sanitizeState({ favorites: [berlin, berlin, { ...berlin, latitude: 91 }],
        plans: [good, { ...good, zone: 'Bad/timezone' }, { ...good, start: 1e25, end: 1e25 + 1e20 }],
        profile: { activity: '__proto__', duration: 500, weekdays: [5, 5, 10], from: '27:00', to: '28:00' }, token: 'secret' });
    assert.equal(state.favorites.length, 1);
    assert.equal(state.plans.length, 1);
    assert.deepEqual(state.plans[0].calendar, { provider: 'google', id: 'event-1' });
    assert.equal(state.profile.activity, 'walk');
    assert.deepEqual(state.profile.weekdays, [5]);
    assert.ok(!JSON.stringify(state).includes('secret'));
    assert.ok(!validPlace({ ...berlin, longitude: Infinity }));
});
test('shared links preserve absolute times and exclude private calendar identifiers', t => {
    const previous = globalThis.window;
    globalThis.window = { location: { href: 'https://jayden-ff.github.io/Jweather/weather.html' } };
    t.after(() => { globalThis.window = previous; });
    const plan = { ...findWindows(forecast(), { now }).windows[0], place: berlin, calendar: { id: 'private-event', provider: 'google' }, accessToken: 'secret' };
    const url = new URL(sharedPlanURL(plan));
    assert.ok(url.pathname.startsWith('/Jweather/'));
    const restored = readSharedPlan(url.searchParams, berlin, plan.zone);
    assert.equal(restored.start, plan.start);
    assert.equal(restored.end, plan.end);
    assert.ok(!url.href.includes('private-event') && !url.href.includes('secret'));
    url.searchParams.set('planAt', '2026-02-30T12:00:00Z');
    assert.equal(readSharedPlan(url.searchParams, berlin, plan.zone), null);
    url.searchParams.set('planAt', '2026-10-09T12:00:00Z');
    url.searchParams.set('activity', 'sunset');
    assert.equal(readSharedPlan(url.searchParams, berlin, plan.zone), null);
});
test('GPX contains mapped coordinates and escapes destination names', () => {
    const route = { name: 'Park & <garden>', activity: 'cycle', destination: { latitude: 52.525, longitude: 13.397 }, coordinates: [[13.405, 52.52], [13.397, 52.525], [13.405, 52.52]] };
    const gpx = routeGPX(route);
    assert.match(gpx, /Park &amp; &lt;garden&gt;/);
    assert.match(gpx, /lat="52.525" lon="13.397"/);
    assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
    const url = new URL(directionsURL(berlin, route));
    assert.equal(url.searchParams.get('travelmode'), 'bicycling');
    assert.equal(url.searchParams.get('origin'), url.searchParams.get('destination'));
    assert.ok(distanceBetween(berlin, route.destination) > 500);
    assert.ok(Number.isFinite(distanceBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })));
});
test('routing rejects malformed geometry and distant snapping rather than inventing a path', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        const data = routeFixture(url);
        if (new URL(url).pathname.includes('13.398')) data.routes[0].geometry.coordinates[1] = [NaN, 91];
        else data.waypoints[1].location = [20, 60];
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    });
    await assert.rejects(routeTo(berlin, { latitude: 52.525, longitude: 13.398, name: 'Bad geometry' }), /incomplete/);
    await assert.rejects(routeTo(berlin, { latitude: 52.525, longitude: 13.399, name: 'Distant snapping' }), /nearby/);
});
