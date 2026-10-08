import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWindows, localToUTC, localParts } from '../activity-engine.js';
import { makeEvent, calendarLinks, buildICS, eventID } from '../calendar.js';
import { fixture } from './fixtures.mjs';

const now = Date.parse('2026-10-08T12:15:00Z');
function data() {
    const f = structuredClone(fixture);
    const keys = Object.keys(f.hourly).filter(key => key !== 'time');
    f.hourly.time = Array.from({ length: 96 }, (_, i) => '2026-10-' + String(8 + Math.floor(i / 24)).padStart(2, '0') + 'T' + String(i % 24).padStart(2, '0') + ':00');
    keys.forEach(key => { f.hourly[key] = Array(96).fill(f.hourly[key][0]); });
    return f;
}
const find = (f, options = {}) => findWindows(f, { now, ...options });
test('suggestions fit the whole activity, stay in daylight and never start in the past', () => {
    const f = data();
    const result = find(f, { duration: 90 });
    assert.equal(result.windows.length, 3);
    for (const w of result.windows) {
        assert.ok(w.start >= now + 5 * 60000);
        assert.equal(w.end - w.start, 90 * 60000);
        assert.ok(w.end <= now + 72 * 3600000);
        assert.ok(localParts(w.start, w.zone).slice(11, 16) >= '07:15');
        assert.ok(localParts(w.end, w.zone).slice(11, 16) <= '18:30');
    }
    for (const [i, w] of result.windows.entries()) {
        assert.ok(result.windows.slice(i + 1).every(other => w.end + 1800000 <= other.start || other.end + 1800000 <= w.start));
    }
});
test('a comfortable near-term window wins over comparable later conditions', () => {
    assert.equal(localParts(find(data()).windows[0].start, 'Europe/Berlin'), '2026-10-08T14:30:00');
});
test('a bad second hour disqualifies a 90-minute suggestion', () => {
    const f = data();
    f.hourly.weather_code[15] = 95;
    const result = find(f, { duration: 90, day: 'today' });
    assert.ok(result.windows.length);
    const stormStart = localToUTC('2026-10-08T15:00', f.timezone);
    assert.ok(result.windows.every(w => w.end <= stormStart || w.start >= stormStart + 3600000));
});
for (const [key, value] of [['precipitation_probability', 80], ['wind_gusts_10m', 60], ['weather_code', 66], ['apparent_temperature', 40], ['uv_index', 9]]) {
    test('unsuitable ' + key + ' produces no recommendation', () => {
        const f = data();
        f.hourly[key].fill(value);
        assert.equal(find(f).windows.length, 0);
    });
}
test('missing wind data produces an honest incomplete state', () => {
    const f = data();
    delete f.hourly.wind_speed_10m;
    const result = find(f);
    assert.equal(result.windows.length, 0);
    assert.equal(result.incomplete, true);
});
test('negative rain readings and unknown weather codes are not suitable weather', () => {
    const f = data();
    f.hourly.precipitation_probability.fill(-1);
    assert.equal(find(f).windows.length, 0);
    f.hourly.precipitation_probability.fill(10);
    f.hourly.weather_code.fill(999);
    assert.equal(find(f).windows.length, 0);
});
test('cycling uses a stricter wind limit than walking', () => {
    const f = data();
    f.hourly.wind_speed_10m.fill(23);
    assert.ok(find(f, { activity: 'walk' }).windows.length);
    assert.equal(find(f, { activity: 'cycle' }).windows.length, 0);
});
test('today, tomorrow and time-of-day filters keep the requested day and period', () => {
    const result = find(data(), { day: 'tomorrow', period: 'morning', duration: 30 });
    assert.ok(result.windows.length);
    assert.ok(result.windows.every(w => w.date === '2026-10-09' && Number(localParts(w.start, w.zone).slice(11, 13)) < 12));
    assert.equal(find(data(), { day: 'today', period: 'morning' }).windows.length, 0);
});
test('sunset is the 45 minutes before local sunset, with no promise of colours', () => {
    const result = find(data(), { activity: 'sunset', day: 'today' });
    assert.equal(result.windows.length, 1);
    assert.equal(localParts(result.windows[0].start, 'Europe/Berlin'), '2026-10-08T17:45:00');
    assert.equal(localParts(result.windows[0].end, 'Europe/Berlin'), '2026-10-08T18:30:00');
    const f = data();
    f.hourly.cloud_cover.fill(100);
    assert.equal(find(f, { activity: 'sunset' }).windows.length, 0);
});
test('a missing hour cannot be treated as a continuous forecast', () => {
    const f = data();
    for (const key of Object.keys(f.hourly)) f.hourly[key].splice(15, 1);
    const gap = localToUTC('2026-10-08T15:00', f.timezone);
    assert.ok(find(f, { duration: 90, day: 'today' }).windows.every(w => w.end <= gap || w.start >= gap + 3600000));
});
test('timezone conversion handles fractional offsets and daylight-saving boundaries', () => {
    assert.equal(new Date(localToUTC('2026-10-08T17:30', 'Asia/Kathmandu')).toISOString(), '2026-10-08T11:45:00.000Z');
    assert.equal(new Date(localToUTC('2026-03-29T01:30', 'Europe/Berlin')).toISOString(), '2026-03-29T00:30:00.000Z');
    assert.equal(new Date(localToUTC('2026-03-29T03:30', 'Europe/Berlin')).toISOString(), '2026-03-29T01:30:00.000Z');
    assert.equal(localToUTC('2026-03-29T02:30', 'Europe/Berlin'), null);
    assert.equal(localToUTC('2026-10-25T02:30', 'Europe/Berlin'), null);
    assert.equal(localToUTC('2026-02-30T10:00', 'UTC'), null);
    assert.equal(localToUTC('2026-10-08T10:00', 'not-a-zone'), null);
});
test('calendar providers and ICS carry the same absolute start and end', () => {
    const w = find(data(), { activity: 'sunset', day: 'today' }).windows[0];
    const event = makeEvent(w, { name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 }, 'Example forecast', 'https://example.com/Jweather/');
    const links = calendarLinks(event);
    const google = new URL(links.google);
    const outlook = new URL(links.outlook);
    assert.equal(google.searchParams.get('dates'), '20261008T154500Z/20261008T163000Z');
    assert.equal(google.searchParams.get('ctz'), 'Europe/Berlin');
    assert.equal(outlook.searchParams.get('startdt'), '2026-10-08T15:45:00.000Z');
    assert.equal(outlook.searchParams.get('enddt'), '2026-10-08T16:30:00.000Z');
    assert.ok(links.office.startsWith('https://outlook.office.com/'));
    const ics = buildICS(event, now);
    assert.ok(ics.includes('DTSTART:20261008T154500Z\r\n'));
    assert.ok(ics.includes('DTEND:20261008T163000Z\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
test('ICS escapes injected lines and folds Unicode at 75 bytes without damaging text', () => {
    const w = find(data()).windows[0];
    const place = { name: 'München, 東京; ' + '☀'.repeat(35) + '\nBEGIN:VEVENT', latitude: 48, longitude: 11 };
    const event = makeEvent(w, place, 'Backslash \\ and\nnew line', 'https://example.com/');
    const ics = buildICS(event, now);
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
    const unfolded = ics.replace(/\r\n /g, '');
    assert.equal(ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
    assert.ok(unfolded.includes('München\\, 東京\\;'));
    assert.ok(unfolded.includes('\\nBEGIN:VEVENT'));
    assert.ok(!unfolded.includes('�'));
});
test('stable event IDs prevent retry duplicates and distinguish activity and duration', async () => {
    const w = find(data()).windows[0];
    const place = { name: 'Berlin', latitude: 52, longitude: 13 };
    const event = makeEvent(w, place, '', 'https://example.com/');
    assert.equal(await eventID(event), await eventID(makeEvent(w, place, '', 'https://example.com/')));
    assert.notEqual(await eventID(event), await eventID(makeEvent({ ...w, duration: 30, end: w.start + 1800000 }, place, '', 'https://example.com/')));
    assert.match(await eventID(event), /^[0-9a-f]{64}$/);
});
