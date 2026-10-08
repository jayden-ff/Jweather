import { activities, findWindows, clockTime, dayLabel, localParts } from './activity-engine.js?v=20261008.4';
import { makeEvent, calendarLinks, buildICS, configuration, prepareGoogle, addDirect, disconnectCalendars, hasConnections } from './calendar.js?v=20261008.4';

const $ = id => document.getElementById(id);
const section = $('outside-section');
let forecast;
let result;
let chosen;
let animation;
let busy = false;
let event;
const completed = new Map();
const preferences = { activity: 'walk', duration: 60, period: 'any', day: 'next' };
try {
    const saved = JSON.parse(localStorage.getItem('jweather.activities'));
    if (saved && Object.hasOwn(activities, saved.activity)) preferences.activity = saved.activity;
    if ([30, 60, 90].includes(saved?.duration)) preferences.duration = saved.duration;
    if (['any', 'morning', 'afternoon', 'evening'].includes(saved?.period)) preferences.period = saved.period;
} catch { /* Recommendations work without storage. */ }
function save() {
    try { localStorage.setItem('jweather.activities', JSON.stringify(preferences)); } catch { /* Optional. */ }
}
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function temp(value) {
    return Math.round(forecast.unit === 'fahrenheit' ? value * 9 / 5 + 32 : value);
}
function range(window) {
    const low = temp(window.minTemperature), high = temp(window.maxTemperature);
    return (low === high ? low : low + '–' + high) + '°' + (forecast.unit === 'fahrenheit' ? 'F' : 'C');
}
function reasons(window) {
    return [range(window), 'Rain up to ' + Math.round(window.rain) + '%', 'Wind up to ' + Math.round(window.wind) + ' km/h'];
}
function syncControls() {
    section.dataset.activity = preferences.activity;
    document.querySelectorAll('[data-activity-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.activityChoice === preferences.activity)));
    $('outside-duration').value = String(preferences.duration);
    $('outside-period').value = preferences.period;
    $('outside-day').value = preferences.day;
    $('duration-field').hidden = preferences.activity === 'sunset';
    $('period-field').hidden = preferences.activity === 'sunset';
    movePill();
}
function movePill() {
    const button = document.querySelector('[data-activity-choice="' + preferences.activity + '"]');
    const control = section.querySelector('.activity-switch');
    control.style.setProperty('--pill-left', button.offsetLeft + 'px');
    control.style.setProperty('--pill-width', button.offsetWidth + 'px');
}
function animateMoment() {
    animation?.cancel();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation = $('moment-copy').animate([{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }],
            { duration: 430, easing: 'cubic-bezier(.2,.65,.25,1)' });
    }
}
function renderEmpty(incomplete = false) {
    chosen = null;
    const copy = $('moment-copy');
    copy.replaceChildren(el('p', 'moment-badge', 'A little patience'),
        el('h3', 'moment-title', incomplete ? 'A little more data needed.' : 'No comfortable window yet.'),
        el('p', 'moment-empty', incomplete ? 'This forecast is missing some hourly readings. Try another location or check again later.'
            : 'The forecast does not offer a good fit for this activity. Try another day or adjust your preferences.'));
    const change = el('button', 'moment-change', preferences.day === 'next' ? 'Adjust your preferences ↗' : 'Look across the next 3 days ↗');
    change.type = 'button';
    change.addEventListener('click', () => {
        if (preferences.day !== 'next') { preferences.day = 'next'; syncControls(); render(); }
        else { $('outside-preferences').open = true; $('outside-period').focus(); }
    });
    copy.append(change);
    $('moment-visual').hidden = true;
    animateMoment();
}
function drawTimeline(window) {
    const track = $('moment-timeline');
    const start = localParts(window.start, window.zone);
    const end = localParts(window.end, window.zone);
    const minutes = value => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
    const from = Math.max(0, Math.min(1, (minutes(start) - 360) / 1080));
    const to = Math.max(0, Math.min(1, (minutes(end) - 360) / 1080));
    const highlight = track.querySelector('.timeline-selection') || el('span', 'timeline-selection');
    if (!highlight.parentNode) track.append(highlight);
    highlight.style.left = from * 100 + '%';
    highlight.style.width = Math.max(0, to - from) * 100 + '%';
    track.querySelectorAll('.timeline-bar').forEach(bar => bar.remove());
    for (let hour = 6; hour < 24; hour++) {
        const hourData = result.hours.find(h => h.time.slice(0, 10) === window.date && Number(h.time.slice(11, 13)) === hour);
        const reading = hourData?.daylight ? hourData.reading : { score: 0 };
        const bar = el('span', 'timeline-bar' + (!reading ? ' missing' : '') + (reading?.score >= 55 ? ' good' : ''));
        bar.style.setProperty('--bar-height', (reading?.score ?? 0) + '%');
        bar.style.setProperty('--bar-order', String(hour - 6));
        track.append(bar);
    }
    $('timeline-caption').textContent = dayLabel(window.date, result.today) + ' · Taller bars, better conditions. Highlighted: your moment.';
}
function choose(window) {
    chosen = window;
    const copy = $('moment-copy');
    const day = dayLabel(window.date, result.today);
    const duration = window.duration === 60 ? '1 hour' : window.duration + ' minutes';
    copy.replaceChildren(el('p', 'moment-badge', (window.score >= 75 ? 'A good fit' : 'A fair fit') + ' · ' + day + ' · ' + duration),
        el('h3', 'moment-title', activities[window.activity].title));
    const time = el('p', 'moment-time');
    time.append(el('span', '', clockTime(window.start, window.zone)), el('span', 'moment-dash', '–'), el('span', '', clockTime(window.end, window.zone)));
    const list = el('ul', 'moment-reasons');
    reasons(window).forEach(reason => list.append(el('li', '', reason)));
    const add = el('button', 'moment-add', 'Add to calendar');
    add.type = 'button';
    const arrow = el('span', '', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    add.append(arrow);
    add.addEventListener('click', openCalendar);
    copy.append(time, list, el('p', 'moment-local', 'Local time in ' + forecast.place.name + '.'), add);
    $('moment-visual').hidden = false;
    drawTimeline(window);
    const alternatives = $('moment-alternatives');
    alternatives.replaceChildren();
    result.windows.forEach((suggestion, index) => {
        const button = el('button', 'moment-alternative');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(suggestion.start === window.start));
        button.setAttribute('aria-label', dayLabel(suggestion.date, result.today) + ', ' + clockTime(suggestion.start, suggestion.zone) + ' to ' + clockTime(suggestion.end, suggestion.zone));
        button.append(el('span', 'alternative-label', index === 0 ? 'Our pick' : 'Another moment'),
            el('span', 'alternative-time', clockTime(suggestion.start, suggestion.zone) + '–' + clockTime(suggestion.end, suggestion.zone)),
            el('span', 'alternative-day', dayLabel(suggestion.date, result.today)));
        button.addEventListener('click', () => { choose(suggestion); $('moment-alternatives').children[index]?.focus(); });
        alternatives.append(button);
    });
    animateMoment();
}
function render() {
    if (!forecast) return;
    const previous = chosen?.start;
    try {
        result = findWindows(forecast.weather, { ...preferences, period: preferences.activity === 'sunset' ? 'any' : preferences.period });
        if (!result.windows.length) renderEmpty(result.incomplete);
        else choose(result.windows.find(window => window.start === previous) || result.windows[0]);
    } catch { renderEmpty(true); }
    requestAnimationFrame(movePill);
}
function calendarOption(container, name, caption, href, provider) {
    const direct = provider && configuration(provider);
    const item = el(direct ? 'button' : 'a', 'calendar-provider');
    if (direct) {
        item.type = 'button';
        item.dataset.provider = provider;
        item.addEventListener('click', () => connectAndAdd(provider, item));
    } else {
        item.href = href;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
    }
    const text = el('span');
    text.append(el('strong', '', name), el('small', '', direct ? 'Connect and add automatically' : caption));
    const mark = el('span', 'calendar-provider-mark ' + (provider || 'office'), name[0]);
    const arrow = el('span', 'calendar-arrow', '↗');
    mark.setAttribute('aria-hidden', 'true');
    arrow.setAttribute('aria-hidden', 'true');
    item.append(mark, text, arrow);
    container.append(item);
}
async function connectAndAdd(provider, button) {
    if (busy) return;
    const key = provider + ':' + event.uid;
    if (completed.has(key)) {
        $('calendar-status').textContent = 'This activity is already in your calendar.';
        return;
    }
    const pendingEvent = event;
    busy = true;
    const buttons = [...$('calendar-providers').querySelectorAll('button')];
    buttons.forEach(b => { b.disabled = true; });
    $('calendar-disconnect').disabled = true;
    button.setAttribute('aria-busy', 'true');
    $('calendar-status').textContent = 'Connecting to ' + (provider === 'google' ? 'Google Calendar' : 'Outlook') + ' …';
    try {
        const saved = await addDirect(provider, pendingEvent);
        completed.set(key, saved);
        if (event.uid === pendingEvent.uid) {
            $('calendar-status').replaceChildren(el('span', 'calendar-confirmation', '✓ Added to your calendar.'));
            if (/^https:\/\/(calendar\.google\.com|www\.google\.com|outlook\.live\.com|outlook\.office\.com)\//.test(saved.url)) {
                const link = el('a', 'text-link', 'View event ↗');
                link.href = saved.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                $('calendar-status').append(link);
            }
            button.querySelector('small').textContent = 'Added to your calendar';
        }
    } catch (error) {
        if (event.uid === pendingEvent.uid) $('calendar-status').textContent = error.name === 'TimeoutError'
            ? 'The calendar did not respond in time. Check your calendar before trying again.' : error.message;
    } finally {
        busy = false;
        $('calendar-disconnect').disabled = false;
        buttons.forEach(b => { b.disabled = false; });
        button.removeAttribute('aria-busy');
        $('calendar-disconnect').hidden = !hasConnections();
    }
}
function openCalendar() {
    if (!chosen || busy) return;
    event = makeEvent(chosen, forecast.place, reasons(chosen).join(' · '), window.location.href);
    const preview = $('calendar-preview');
    preview.replaceChildren(el('strong', '', event.title),
        el('span', '', dayLabel(chosen.date, result.today) + ' · ' + clockTime(chosen.start, chosen.zone) + '–' + clockTime(chosen.end, chosen.zone)),
        el('span', '', event.location + ' · ' + chosen.zone));
    const links = calendarLinks(event);
    const providers = $('calendar-providers');
    providers.replaceChildren();
    calendarOption(providers, 'Google Calendar', 'Open a ready-to-save event', links.google, 'google');
    calendarOption(providers, 'Outlook', 'Personal calendar · ready to save', links.outlook, 'microsoft');
    calendarOption(providers, 'Microsoft 365', 'Work or school calendar · ready to save', links.office);
    const download = el('button', 'calendar-provider');
    download.type = 'button';
    download.dataset.ics = '';
    const text = el('span');
    text.append(el('strong', '', 'Apple Calendar & others'), el('small', '', 'Download an .ics file, then open it'));
    download.append(el('span', 'calendar-provider-mark', '↓'), text, el('span', 'calendar-arrow', '↓'));
    download.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([buildICS(event)], { type: 'text/calendar;charset=utf-8' }));
        const link = el('a');
        link.href = url;
        link.download = 'jweather-' + chosen.activity + '-' + chosen.date + '.ics';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        $('calendar-status').textContent = 'Your calendar file is ready. Open it to import the activity.';
    });
    providers.append(download);
    const connected = configuration('google') || configuration('microsoft');
    $('calendar-explainer').textContent = connected ? 'Connect your account to add this activity automatically. Calendar links and files are available too.'
        : 'The details are ready. Choose your calendar, then save the event there.';
    if (configuration('google')) {
        calendarOption(providers, 'Google Calendar link', 'Open a ready-to-save event instead', links.google);
        prepareGoogle().catch(error => { $('calendar-status').textContent = error.message; });
    }
    if (configuration('microsoft')) calendarOption(providers, 'Outlook calendar link', 'Open a ready-to-save event instead', links.outlook);
    $('calendar-status').textContent = '';
    $('calendar-disconnect').hidden = !hasConnections();
    $('calendar-dialog').showModal();
}
section.querySelectorAll('[data-activity-choice]').forEach(button => button.addEventListener('click', () => {
    preferences.activity = button.dataset.activityChoice;
    chosen = null;
    save();
    syncControls();
    render();
}));
for (const [id, key] of [['outside-day', 'day'], ['outside-duration', 'duration'], ['outside-period', 'period']]) {
    $(id).addEventListener('change', () => {
        preferences[key] = key === 'duration' ? Number($(id).value) : $(id).value;
        chosen = null;
        save();
        render();
    });
}
const dialog = $('calendar-dialog');
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => section.querySelector('.moment-add')?.focus({ preventScroll: true }));
dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
});
$('calendar-disconnect').addEventListener('click', () => {
    disconnectCalendars();
    completed.clear();
    $('calendar-disconnect').hidden = true;
    $('calendar-status').textContent = 'Disconnected here. Your existing calendar events remain.';
});
window.addEventListener('resize', movePill, { passive: true });
window.addEventListener('jweather:forecast', e => { forecast = e.detail; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dialog.open) render(); });
syncControls();
if (window.JweatherForecast) { forecast = window.JweatherForecast; render(); }
