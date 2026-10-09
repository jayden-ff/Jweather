import { activities } from './activity-engine.js?v=20261009.1';
const key = 'jweather.personal.v1';
const clean = value => typeof value === 'string' ? value.trim().slice(0, 140) : '';
export function validPlace(place) {
    return place && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90
        && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180 && typeof place.name === 'string' && !!place.name.trim();
}
export const placeKey = place => Number(place.latitude).toFixed(3) + ',' + Number(place.longitude).toFixed(3);
const defaults = () => ({ favorites: [], plans: [], profile: { activity: 'walk', duration: 60, from: '17:00', to: '21:00', weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: false } });
function tidyPlace(place) {
    return { latitude: place.latitude, longitude: place.longitude, name: clean(place.name), country: clean(place.country), admin1: clean(place.admin1) };
}
function validPlan(plan) {
    return plan && validPlace(plan.place) && Object.hasOwn(activities, plan.activity) && Number.isFinite(plan.start) && Number.isFinite(plan.end)
        && Math.abs(plan.start) < 8.64e15 && Math.abs(plan.end) < 8.64e15
        && plan.end > plan.start && plan.end - plan.start <= 180 * 60000 && validZone(plan.zone)
        && typeof plan.id === 'string' && !!plan.id && plan.id.length < 200;
}
function validZone(zone) {
    if (typeof zone !== 'string' || zone.length > 140) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); return true; } catch { return false; }
}
export function sanitizeState(raw) {
    const state = defaults();
    if (!raw || typeof raw !== 'object') return state;
    if (Array.isArray(raw.favorites)) state.favorites = raw.favorites.filter(validPlace).map(tidyPlace)
        .filter((p, i, all) => all.findIndex(other => placeKey(other) === placeKey(p)) === i).slice(0, 4);
    if (Array.isArray(raw.plans)) state.plans = raw.plans.filter(validPlan).slice(0, 24).map(plan => {
        const result = { id: plan.id, activity: plan.activity, start: plan.start, end: plan.end,
            duration: Math.round((plan.end - plan.start) / 60000), zone: clean(plan.zone), place: tidyPlace(plan.place),
            createdAt: Number.isFinite(plan.createdAt) ? plan.createdAt : Date.now() };
        if (plan.calendar && ['google', 'microsoft'].includes(plan.calendar.provider) && typeof plan.calendar.id === 'string' && plan.calendar.id.length < 2000) {
            result.calendar = { provider: plan.calendar.provider, id: plan.calendar.id };
        }
        return result;
    });
    const p = raw.profile;
    if (p && Object.hasOwn(activities, p.activity)) state.profile.activity = p.activity;
    if ([30, 60, 90].includes(p?.duration)) state.profile.duration = p.duration;
    const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (time(p?.from) && time(p?.to) && p.from < p.to) { state.profile.from = p.from; state.profile.to = p.to; }
    if (Array.isArray(p?.weekdays) && p.weekdays.some(d => Number.isInteger(d) && d >= 0 && d <= 6)) {
        state.profile.weekdays = [...new Set(p.weekdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))];
    }
    state.profile.enabled = p?.enabled === true;
    return state;
}
let persistent = true;
let state;
try { state = sanitizeState(JSON.parse(localStorage.getItem(key))); } catch { state = defaults(); persistent = false; }
function notify() { if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event('jweather:personal')); }
function write() {
    try { localStorage.setItem(key, JSON.stringify(state)); persistent = true; } catch { persistent = false; }
    notify();
}
export const getState = () => structuredClone(state);
export const hasPersistentStorage = () => persistent;
export function toggleFavorite(place) {
    if (!validPlace(place)) return false;
    const index = state.favorites.findIndex(p => placeKey(p) === placeKey(place));
    if (index >= 0) state.favorites.splice(index, 1);
    else {
        if (state.favorites.length >= 4) return false;
        state.favorites.push(tidyPlace(place));
    }
    write();
    return true;
}
export function setProfile(profile) {
    state.profile = sanitizeState({ profile }).profile;
    write();
}
export function savePlan(window, place) {
    if (!validPlace(place) || !Object.hasOwn(activities, window.activity)) throw new Error('This activity cannot be saved.');
    const duplicate = state.plans.find(p => placeKey(p.place) === placeKey(place) && p.activity === window.activity && p.start === window.start && p.end === window.end);
    if (duplicate) return structuredClone(duplicate);
    state.plans = state.plans.filter(p => p.end > Date.now() - 86400000);
    if (state.plans.length >= 24) throw new Error('Your plan list is full. Remove an old plan first.');
    const plan = { id: crypto.randomUUID(), place: tidyPlace(place), activity: window.activity, start: window.start, end: window.end,
        duration: window.duration, zone: window.zone, createdAt: Date.now() };
    if (!validPlan(plan)) throw new Error('This activity cannot be saved.');
    state.plans.push(plan);
    write();
    return structuredClone(plan);
}
export function updatePlan(id, window) {
    const plan = state.plans.find(p => p.id === id);
    if (!plan) return null;
    const moved = { ...plan, activity: window.activity, start: window.start, end: window.end, duration: window.duration, zone: window.zone };
    if (!validPlan(moved)) return null;
    Object.assign(plan, moved);
    write();
    return structuredClone(plan);
}
export function linkCalendar(id, provider, eventID) {
    const plan = state.plans.find(p => p.id === id);
    if (plan && ['google', 'microsoft'].includes(provider) && typeof eventID === 'string' && eventID.length > 0 && eventID.length < 2000) {
        plan.calendar = { provider, id: eventID };
        write();
    }
}
export function removePlan(id) { state.plans = state.plans.filter(p => p.id !== id); write(); }
export function restorePlan(plan) {
    const restored = sanitizeState({ plans: [plan] }).plans[0];
    if (!restored) throw new Error('This plan cannot be restored.');
    if (state.plans.some(p => p.id === restored.id)) return;
    const duplicate = state.plans.findIndex(p => p.activity === restored.activity && p.start === restored.start
        && p.end === restored.end && placeKey(p.place) === placeKey(restored.place));
    if (duplicate >= 0) {
        const calendar = state.plans[duplicate].calendar;
        if (calendar && (calendar.provider !== restored.calendar?.provider || calendar.id !== restored.calendar?.id)) {
            throw new Error('This moment now has a different calendar link. Remove that saved plan before undoing.');
        }
        state.plans[duplicate] = restored;
    } else {
        if (state.plans.length >= 24) throw new Error('Your plan list is full. Remove an old plan first.');
        state.plans.push(restored);
    }
    write();
}
export function clearPersonalData() { state = defaults(); write(); }
if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('storage', event => {
    if (event.key !== key) return;
    try { state = sanitizeState(JSON.parse(event.newValue)); } catch { state = defaults(); }
    notify();
});
