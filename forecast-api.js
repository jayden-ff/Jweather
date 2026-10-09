import { placeKey, validPlace } from './personal-store.js?v=20261009.1';
const forecasts = new Map();
export function forecastURL(place) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
        latitude: String(place.latitude), longitude: String(place.longitude), timezone: 'auto', forecast_days: '6',
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m',
        hourly: 'temperature_2m,apparent_temperature,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,uv_index,cloud_cover',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
        temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
    });
    return url.href;
}
export function rememberForecast(place, data) { forecasts.set(placeKey(place), { time: Date.now(), promise: Promise.resolve(data) }); }
export async function fetchForecast(place, fresh = false) {
    if (!validPlace(place)) throw new Error('Choose a valid place.');
    const key = placeKey(place);
    const entry = forecasts.get(key);
    if (!fresh && entry && Date.now() - entry.time < 10 * 60000) return entry.promise;
    const promise = (async () => {
        const response = await fetch(forecastURL(place), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('The forecast could not load. Try again shortly.');
        const data = await response.json();
        if (data.error || !data.current || !Array.isArray(data.hourly?.time) || !Array.isArray(data.daily?.time) || typeof data.timezone !== 'string') throw new Error('This forecast is incomplete.');
        data._jweather = { cached: response.headers.get('X-Jweather-Offline') === '1',
            savedAt: response.headers.get('X-Jweather-Saved-At') || new Date().toISOString(), url: forecastURL(place) };
        window.dispatchEvent(new CustomEvent('jweather:cache-forecast', { detail: { data, url: forecastURL(place) } }));
        return data;
    })();
    forecasts.set(key, { time: Date.now(), promise });
    try { return await promise; } catch (error) { if (forecasts.get(key)?.promise === promise) forecasts.delete(key); throw error; }
}
export async function searchPlaces(query, signal) {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: query.trim(), count: '6', language: 'en', format: 'json' });
    const response = await fetch(url, { signal: signal || AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Place search is unavailable. Try again shortly.');
    const data = await response.json();
    return Array.isArray(data.results) ? data.results.filter(validPlace) : [];
}
