import { activities } from './activity-engine.js?v=20261008.5';

const googleScope = 'https://www.googleapis.com/auth/calendar.events.owned';
const microsoftScope = 'https://graph.microsoft.com/Calendars.ReadWrite';
const sessions = new Map(); // Access tokens live in memory, never browser storage.
let googleScript;
let connecting = false;
const iso = instant => new Date(instant).toISOString();
const compact = instant => iso(instant).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
export function makeEvent(window, place, reasons, pageURL) {
    return {
        uid: 'jweather-' + window.activity + '-' + place.latitude + '-' + place.longitude + '-' + window.start + '-' + window.duration + '@jayden-ff.github.io',
        title: activities[window.activity].event + ' · ' + place.name,
        location: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
        description: reasons + '\nForecast-based suggestion from Jweather. Conditions can change.\nTimes shown in ' + window.zone + '.\n' + pageURL,
        start: window.start, end: window.end, zone: window.zone
    };
}
export function calendarLinks(event) {
    const google = new URL('https://calendar.google.com/calendar/render');
    google.search = new URLSearchParams({ action: 'TEMPLATE', text: event.title,
        dates: compact(event.start) + '/' + compact(event.end), details: event.description, location: event.location, ctz: event.zone });
    const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
    outlook.search = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent',
        subject: event.title, startdt: iso(event.start), enddt: iso(event.end), body: event.description, location: event.location });
    const office = new URL('https://outlook.office.com/calendar/0/deeplink/compose');
    office.search = outlook.search;
    return { google: google.href, outlook: outlook.href, office: office.href };
}
function escapeText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function fold(line) {
    const encoder = new TextEncoder();
    const rows = [];
    let row = '';
    let length = 0;
    for (const character of line) {
        const bytes = encoder.encode(character).length;
        if (length + bytes > 75) { rows.push(row); row = ' '; length = 1; }
        row += character;
        length += bytes;
    }
    rows.push(row);
    return rows.join('\r\n');
}
export function buildICS(event, stamp = Date.now()) {
    return [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jweather//Time outside//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT', 'UID:' + escapeText(event.uid), 'DTSTAMP:' + compact(stamp),
        'DTSTART:' + compact(event.start), 'DTEND:' + compact(event.end), 'SUMMARY:' + escapeText(event.title),
        'LOCATION:' + escapeText(event.location), 'DESCRIPTION:' + escapeText(event.description),
        'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR', ''
    ].map(fold).join('\r\n');
}
export function configuration(provider) {
    const config = globalThis.JweatherCalendarConfig || {};
    return provider === 'google' ? String(config.googleClientId || '').trim() : String(config.microsoftClientId || '').trim();
}
export function disconnectCalendars() { sessions.clear(); }
export function hasConnections() { return sessions.size > 0; }
function loadGoogle() {
    if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
    if (!googleScript) googleScript = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        const timer = setTimeout(() => { script.remove(); googleScript = null; reject(new Error('Google could not load. Use the calendar link or ICS file instead.')); }, 15000);
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); script.remove(); googleScript = null; reject(new Error('Google could not load. Use the calendar link or ICS file instead.')); };
        document.head.append(script);
    });
    return googleScript;
}
export async function prepareGoogle() {
    if (configuration('google')) await loadGoogle();
}
function googleToken() {
    // The SDK is loaded when the calendar chooser opens, keeping this call in the click gesture.
    if (!globalThis.google?.accounts?.oauth2) throw new Error('Google is still loading. Please try again in a moment.');
    return new Promise((resolve, reject) => {
        const client = globalThis.google.accounts.oauth2.initTokenClient({
            client_id: configuration('google'), scope: googleScope, include_granted_scopes: false,
            callback(response) {
                if (response.error || !response.access_token || !response.scope?.split(' ').includes(googleScope)) {
                    reject(new Error('Calendar access was not granted. You can still use the calendar link or ICS file.')); return;
                }
                resolve({ token: response.access_token, expiry: Date.now() + Number(response.expires_in || 3600) * 1000 - 60000 });
            },
            error_callback() { reject(new Error('The connection was closed or blocked. Try again, or use a calendar link.')); }
        });
        client.requestAccessToken({ prompt: 'select_account' });
    });
}
function randomString() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
async function hash(value) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
export async function eventID(event) {
    return Array.from(await hash(event.uid), b => b.toString(16).padStart(2, '0')).join('');
}
async function microsoftToken() {
    const popup = window.open('about:blank', 'jweather-calendar-connect', 'width=520,height=680');
    if (!popup) throw new Error('The sign-in window was blocked. Allow popups, or use a calendar link.');
    const state = randomString();
    const verifier = randomString();
    const challenge = btoa(String.fromCharCode(...await hash(verifier))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tenant = String(globalThis.JweatherCalendarConfig?.microsoftTenant || 'common');
    if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) { popup.close(); throw new Error('The calendar connection is unavailable. Use a calendar link instead.'); }
    const redirect = new URL('calendar-callback.html', window.location.href).href;
    const authority = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/';
    const url = new URL(authority + 'authorize');
    url.search = new URLSearchParams({ client_id: configuration('microsoft'), response_type: 'code', redirect_uri: redirect,
        scope: microsoftScope, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account', response_mode: 'query' });
    const code = await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timeout); clearInterval(poll); window.removeEventListener('message', onMessage); };
        const onMessage = message => {
            if (message.origin !== window.location.origin || message.source !== popup || message.data?.type !== 'jweather:calendar-auth'
                || message.data.state !== state) return;
            cleanup();
            popup.close();
            if (message.data.error || typeof message.data.code !== 'string' || !message.data.code) reject(new Error('Calendar access was not granted. Use a calendar link or try again.'));
            else resolve(message.data.code);
        };
        const timeout = setTimeout(() => { cleanup(); popup.close(); reject(new Error('Sign-in took too long. Please try again.')); }, 120000);
        const poll = setInterval(() => { if (popup.closed) { cleanup(); reject(new Error('Sign-in was closed. You can still use a calendar link.')); } }, 500);
        window.addEventListener('message', onMessage);
        popup.location.replace(url.href);
    });
    const response = await fetch(authority + 'token', { method: 'POST', body: new URLSearchParams({
        client_id: configuration('microsoft'), grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, scope: microsoftScope
    }), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.access_token || String(data.token_type).toLowerCase() !== 'bearer') throw new Error('The calendar connection failed. Use a calendar link or try again.');
    return { token: data.access_token, expiry: Date.now() + Number(data.expires_in || 3600) * 1000 - 60000 };
}
export async function addDirect(provider, event) {
    return writeCalendar(provider, event);
}
export async function updateDirect(provider, event, binding) {
    if (!binding || binding.provider !== provider || !binding.id) throw new Error('Choose the calendar linked to this plan.');
    return writeCalendar(provider, event, binding);
}
async function writeCalendar(provider, event, binding = null) {
    if (event.start <= Date.now()) throw new Error('This moment has passed. Choose another time before adding it.');
    if (!configuration(provider)) throw new Error('Use the calendar link to save this activity.');
    if (connecting) throw new Error('A calendar connection is already in progress.');
    connecting = true;
    try {
        let session = sessions.get(provider);
        if (!session || session.expiry <= Date.now()) {
            session = await (provider === 'google' ? googleToken() : microsoftToken());
            sessions.set(provider, session);
        }
        const id = await eventID(event);
        const google = provider === 'google';
        const base = google ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events' : 'https://graph.microsoft.com/v1.0/me/events';
        const url = binding ? base + '/' + encodeURIComponent(binding.id) : base;
        const body = google ? {
            id, summary: event.title, description: event.description, location: event.location,
            start: { dateTime: iso(event.start), timeZone: event.zone }, end: { dateTime: iso(event.end), timeZone: event.zone }
        } : {
            transactionId: id, subject: event.title, body: { contentType: 'text', content: event.description },
            location: { displayName: event.location },
            start: { dateTime: iso(event.start).slice(0, -1), timeZone: 'UTC' },
            end: { dateTime: iso(event.end).slice(0, -1), timeZone: 'UTC' }
        };
        if (binding) { delete body.id; delete body.transactionId; }
        let response = await fetch(url, { method: binding ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        if (!binding && google && response.status === 409) response = await fetch(url + '/' + id, {
            headers: { Authorization: 'Bearer ' + session.token }, signal: AbortSignal.timeout(15000)
        });
        if (response.status === 401) sessions.delete(provider);
        if (!response.ok) throw new Error(response.status === 401 ? 'Your calendar connection expired. Please connect again.'
            : binding ? 'The calendar event could not be updated. Your saved plan has not moved.' : 'The activity could not be added. Try again, or use a calendar link.');
        const saved = await response.json();
        if (!saved.id) throw new Error('The calendar did not confirm this activity. Please check your calendar before retrying.');
        return { id: saved.id, url: saved.htmlLink || saved.webLink || '' };
    } finally { connecting = false; }
}
