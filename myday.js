import { el, button, placeURL } from './ui.js?v=20261009.1';
import { fetchForecast } from './forecast-api.js?v=20261009.1';
import { getState, toggleFavorite, placeKey, savePlan, hasPersistentStorage } from './personal-store.js?v=20261009.1';
import { activities, findWindows, clockTime, dayLabel } from './activity-engine.js?v=20261009.1';
import { editProfile } from './profile.js?v=20261009.1';
import { pickPlace } from './place-picker.js?v=20261009.1';
let current;
let generation = 0;
export function initMyDay() {
    if (!document.getElementById('myday-content')) return;
    window.addEventListener('jweather:personal', render);
    window.addEventListener('online', () => render(true));
    render();
}
async function render(fresh = false) {
    const state = getState();
    document.body.dataset.personalized = String(state.favorites.length > 0);
    const places = document.getElementById('favorite-links');
    const content = document.getElementById('myday-content');
    const sequence = ++generation;
    const previous = current;
    current = state.favorites.find(p => previous && placeKey(p) === placeKey(previous)) || state.favorites[0];
    places.replaceChildren();
    state.favorites.forEach(place => {
        const chip = button(place.name, 'place-chip', () => { current = place; render(); });
        chip.setAttribute('aria-pressed', String(current && placeKey(place) === placeKey(current)));
        places.append(chip);
    });
    if (state.favorites.length < 4) places.append(button('+ Add a place', 'place-chip', () => pickPlace(place => { toggleFavorite(place); current = place; render(); })));
    if (!current) {
        const card = el('div', 'myday-card welcome-card');
        card.append(el('h3', '', 'Your day, at a glance.'), el('p', '', 'Save a favorite place and tell us when you are free. A good moment will be waiting here.'));
        const actions = el('div', 'journey-actions');
        actions.append(button('Set up my day ↗', 'solid-button', editProfile));
        card.append(actions); content.replaceChildren(card); return;
    }
    const place = current;
    content.replaceChildren(el('p', 'journey-loading', 'Finding a little time in ' + place.name + ' …'));
    try {
        const data = await fetchForecast(place, fresh === true);
        if (sequence !== generation) return;
        const profile = state.profile;
        const options = { activity: profile.activity, duration: profile.duration };
        if (profile.enabled) Object.assign(options, { earliest: profile.from, latest: profile.to, weekdays: profile.weekdays });
        const result = findWindows(data, options);
        const window = result.windows[0];
        const card = el('div', 'myday-card');
        const text = el('div', 'myday-copy');
        text.append(el('p', 'eyebrow', place.name));
        if (data._jweather?.cached) {
            text.append(el('h3', '', 'Your last forecast.'), el('p', '', 'Saved · ' + Math.round(data.current.temperature_2m) + '°C. Check again with a connection to find a fresh moment.'));
        } else if (window) {
            text.append(el('h3', '', activities[window.activity].title),
                el('p', 'myday-time', clockTime(window.start, window.zone) + '–' + clockTime(window.end, window.zone)),
                el('p', 'myday-day', dayLabel(window.date, result.today) + ' · ' + (profile.enabled ? 'Within your free hours' : 'A little time outside')),
                el('p', 'myday-conditions', Math.round(window.minTemperature) + '°C · Rain up to ' + Math.round(window.rain) + '% · Wind up to ' + Math.round(window.wind) + ' km/h'));
            const actions = el('div', 'journey-actions');
            const saved = state.plans.some(p => p.activity === window.activity && p.start === window.start && p.end === window.end && placeKey(p.place) === placeKey(place));
            const save = button(saved ? 'Saved ✓' : 'Save this moment', 'solid-button', () => {
                try {
                    savePlan(window, place);
                    message.textContent = hasPersistentStorage() ? 'Saved to your plans.' : 'Saved for this visit. Browser storage is unavailable.';
                } catch (error) { message.textContent = error.message; }
            });
            save.disabled = saved;
            const message = el('p', 'journey-status'); message.setAttribute('role', 'status');
            actions.append(save); text.append(actions, message);
        } else {
            text.append(el('h3', '', result.incomplete ? 'A little more data needed.' : 'No good fit in your free hours.'),
                el('p', '', 'Try different hours or check the full forecast for another moment.'),
                button('Adjust my hours ↗', 'quiet-button', editProfile));
        }
        const link = el('a', 'myday-forecast', 'See the forecast ↗');
        link.href = placeURL(place);
        card.append(text, link); content.replaceChildren(card);
    } catch {
        if (sequence !== generation) return;
        content.replaceChildren(el('div', 'myday-card', 'This forecast could not load. Your places and preferences are still saved.'),
            button('Try again ↗', 'quiet-button', render));
    }
}
