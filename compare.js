import { el, button, placeURL } from './ui.js?v=20261009.1';
import { getState, placeKey, savePlan, hasPersistentStorage } from './personal-store.js?v=20261009.1';
import { fetchForecast } from './forecast-api.js?v=20261009.1';
import { findWindows, activities, clockTime, localParts, dayLabel } from './activity-engine.js?v=20261009.1';
import { pickPlace } from './place-picker.js?v=20261009.1';
export function comparisonDates(today, mode) {
    const date = new Date(today + 'T12:00:00Z');
    if (mode === 'tomorrow') return [new Date(date.getTime() + 86400000).toISOString().slice(0, 10)];
    if (mode === 'weekend') {
        const days = (6 - date.getUTCDay() + 7) % 7;
        const saturday = new Date(date.getTime() + days * 86400000);
        // On Sunday, include today instead of jumping to next weekend.
        if (date.getUTCDay() === 0) return [today];
        return [saturday.toISOString().slice(0, 10), new Date(saturday.getTime() + 86400000).toISOString().slice(0, 10)];
    }
    return [0, 1, 2].map(days => new Date(date.getTime() + days * 86400000).toISOString().slice(0, 10));
}
export function createComparison(container, getContext) {
    const initial = getContext();
    const places = [initial.place, ...getState().favorites.filter(p => placeKey(p) !== placeKey(initial.place)).slice(0, 2)];
    let mode = 'tomorrow', generation = 0;
    const header = el('div', 'compare-heading');
    header.append(el('h3', '', 'Where shall we go?'), el('p', 'journey-note', 'Compare up to three places for the same activity and local calendar day.'));
    const toolbar = el('div', 'compare-toolbar');
    const label = el('label', 'journey-field', 'Make time for');
    const select = el('select', 'journey-select'); select.setAttribute('aria-label', 'Comparison day');
    for (const [value, text] of [['tomorrow', 'Tomorrow'], ['weekend', 'The weekend'], ['next', 'Next 3 days']]) {
        const option = el('option', '', text); option.value = value; select.append(option);
    }
    select.addEventListener('change', () => { mode = select.value; update(); });
    label.append(select);
    const add = button('+ Add a place', 'quiet-button', () => pickPlace(place => {
        if (places.some(p => placeKey(p) === placeKey(place))) { status.textContent = 'That place is already in your comparison.'; return; }
        if (places.length < 3) { places.push(place); update(); }
    }));
    toolbar.append(label, add);
    const status = el('p', 'journey-status'); status.setAttribute('role', 'status');
    const cards = el('div', 'comparison-cards');
    container.append(header, toolbar, status, cards);
    async function update() {
        const sequence = ++generation;
        const context = getContext();
        if (!context) return;
        const activity = context.activity || context.window?.activity || 'walk';
        const duration = context.duration || context.window?.duration || 60;
        const today = localParts(Date.now(), context.weather.timezone).slice(0, 10);
        const dates = comparisonDates(today, mode);
        add.hidden = places.length >= 3;
        status.textContent = 'Comparing ' + activities[activity].label.toLowerCase() + ' windows …';
        cards.replaceChildren(...places.map(place => el('div', 'comparison-card', 'Checking ' + place.name + ' …')));
        const results = await Promise.all(places.map(async place => {
            try {
                const data = await fetchForecast(place);
                const result = findWindows(data, { activity, duration, dates, horizonHours: 144 });
                return { place, data, window: result.windows[0], available: dates.some(date => data.daily.time.includes(date)) };
            } catch { return { place, error: true }; }
        }));
        if (sequence !== generation) return;
        const usable = results.filter(r => r.window && !r.data._jweather?.cached).sort((a, b) => b.window.score - a.window.score);
        const best = usable.length >= 2 && usable[0].window.score > usable[1].window.score + 1 ? usable[0] : null;
        status.textContent = activities[activity].label + ' · ' + (activity === 'sunset' ? '45 minutes' : duration + ' minutes') + ' · Dates match across places; times are local.';
        cards.replaceChildren();
        results.sort((a, b) => a === best ? -1 : b === best ? 1 : 0).forEach(item => {
            const card = el('article', 'comparison-card'); if (item === best) card.dataset.best = 'true';
            card.append(el('p', 'comparison-badge', item === best ? 'Best available fit' : item.window && !item.data._jweather?.cached ? 'A good fit' : 'A little patience'),
                el('h4', '', item.place.name));
            if (item.error) card.append(el('p', 'journey-note', 'This forecast could not load. Try again shortly.'));
            else if (item.data._jweather?.cached) card.append(el('p', 'journey-note', 'Saved forecast. Check again for a fresh comparison.'));
            else if (!item.window) card.append(el('p', 'journey-note', item.available ? 'No comfortable window for this activity.' : 'That day is not in the forecast yet.'));
            else {
                const window = item.window;
                card.append(el('p', 'comparison-time', clockTime(window.start, window.zone) + '–' + clockTime(window.end, window.zone)),
                    el('p', 'comparison-day', dayLabel(window.date, today)),
                    el('p', 'journey-note', Math.round(context.unit === 'fahrenheit' ? window.minTemperature * 9 / 5 + 32 : window.minTemperature) + '°' + (context.unit === 'fahrenheit' ? 'F' : 'C')
                        + ' · Rain up to ' + Math.round(window.rain) + '% · Wind up to ' + Math.round(window.wind) + ' km/h'));
                card.moment = { window, place: item.place };
                const save = button('Save this moment', 'quiet-button comparison-save', () => {
                    try { savePlan(window, item.place); status.textContent = hasPersistentStorage() ? 'Saved to your plans.' : 'Saved for this visit.'; syncSaved(); }
                    catch (error) { status.textContent = error.message; }
                });
                card.append(save);
            }
            const link = el('a', 'quiet-button', 'See forecast ↗'); link.href = placeURL(item.place); card.append(link);
            if (placeKey(item.place) !== placeKey(getContext().place)) card.append(button('Remove', 'quiet-button', () => {
                const index = places.findIndex(p => placeKey(p) === placeKey(item.place)); if (index >= 0) places.splice(index, 1); update();
            }));
            cards.append(card);
        });
        if (places.length < 2) status.textContent = 'Add another place to find your best option.';
        syncSaved();
    }
    function syncSaved() {
        const plans = getState().plans;
        cards.querySelectorAll('.comparison-save').forEach(control => {
            const { window, place } = control.closest('.comparison-card').moment;
            const saved = plans.some(plan => plan.activity === window.activity && plan.start === window.start
                && plan.end === window.end && placeKey(plan.place) === placeKey(place));
            control.textContent = saved ? 'Saved ✓' : 'Save this moment'; control.disabled = saved;
        });
    }
    return { open: update, update, syncSaved };
}
