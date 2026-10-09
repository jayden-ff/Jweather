import { getState, toggleFavorite, hasPersistentStorage, placeKey } from './personal-store.js?v=20261009.1';
import { rememberForecast } from './forecast-api.js?v=20261009.1';
import { editProfile } from './profile.js?v=20261009.1';
import { initMyDay } from './myday.js?v=20261009.1';
import { initPlans, renderPlans, renderSharedPlan } from './plans.js?v=20261009.1';
import { createExplorer } from './explore.js?v=20261009.1';
import { createComparison } from './compare.js?v=20261009.1';

let forecast = window.JweatherForecast;
let explorer, comparison;
let active = 'plans';
const context = () => window.JweatherMoment || forecast;
document.querySelectorAll('[data-edit-profile]').forEach(control => control.addEventListener('click', editProfile));
function syncFavorite() {
    const control = document.getElementById('favorite-place');
    if (!control || !forecast) return;
    const saved = getState().favorites.some(place => placeKey(place) === placeKey(forecast.place));
    control.textContent = saved ? '★' : '☆';
    control.setAttribute('aria-pressed', String(saved));
    control.setAttribute('aria-label', saved ? 'Remove this place from favorites' : 'Save this place');
}
document.getElementById('favorite-place')?.addEventListener('click', () => {
    if (!forecast) return;
    const changed = toggleFavorite(forecast.place);
    const message = document.getElementById('favorite-status');
    message.textContent = !changed ? 'You can keep four favorites. Remove one in Your preferences.'
        : !hasPersistentStorage() ? 'Saved for this visit. Browser storage is unavailable.'
            : getState().favorites.some(p => placeKey(p) === placeKey(forecast.place)) ? 'Added to My day.' : 'Removed from favorites.';
    syncFavorite();
});
window.addEventListener('jweather:personal', syncFavorite);
window.addEventListener('jweather:personal', () => { explorer?.update(); comparison?.syncSaved(); });
function receiveForecast(value) {
    forecast = value;
    rememberForecast(value.place, value.weather);
    syncFavorite(); renderSharedPlan(value); renderPlans();
}
window.addEventListener('jweather:forecast', event => receiveForecast(event.detail));
window.addEventListener('jweather:moment', () => {
    explorer?.update();
    if (active === 'compare') comparison?.update();
});
const tabs = [...document.querySelectorAll('[data-workspace]')];
function openTab(value, focus = false) {
    active = value;
    tabs.forEach(tab => {
        const selected = tab.dataset.workspace === value;
        tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
        if (selected && focus) tab.focus({ preventScroll: true });
    });
    if (!context()) return;
    if (value === 'map') {
        explorer ||= createExplorer(document.getElementById('map-panel'), context);
        explorer.open();
    } else if (value === 'compare') {
        comparison ||= createComparison(document.getElementById('compare-panel'), context);
        comparison.open();
    }
}
window.addEventListener('jweather:explore', () => {
    openTab('map', true);
    document.getElementById('workspace')?.scrollIntoView({ block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => openTab(tab.dataset.workspace));
    tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); openTab(tabs[next].dataset.workspace, true); }
    });
});
if (forecast) receiveForecast(forecast);
initMyDay(); initPlans();
