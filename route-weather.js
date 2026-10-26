import { checkPlan, assessHour, localParts, localToUTC } from './activity-engine.js?v=20261026.1';
import { distanceBetween } from './route-service.js?v=20261009.1';
const HOUR = 3600000;
const validRoute = route => route && Number.isFinite(route.duration) && route.duration > 0 && route.duration <= 10800
    && Array.isArray(route.coordinates) && route.coordinates.length >= 2
    && route.coordinates.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90);
const point = p => ({ latitude: p[1], longitude: p[0] });
export function sampleRoute(route) {
    if (!validRoute(route)) return [];
    const coordinates = route.coordinates;
    const distances = [0];
    for (let i = 1; i < coordinates.length; i++) distances.push(distances.at(-1) + distanceBetween(point(coordinates[i-1]), point(coordinates[i])));
    const total = distances.at(-1);
    if (!total) return [];
    return [0, .25, .5, .75, 1].map(fraction => {
        const target = total * fraction;
        let i = 1;
        while (i < distances.length-1 && distances[i] < target) i++;
        const ratio = (target - distances[i-1]) / (distances[i] - distances[i-1] || 1);
        const a = coordinates[i-1], b = coordinates[i];
        // Follow the short arc when geometry crosses the antimeridian.
        const delta = ((b[0] - a[0] + 540) % 360) - 180;
        return { fraction, latitude: a[1] + (b[1]-a[1])*ratio, longitude: ((a[0] + delta*ratio + 540) % 360) - 180 };
    });
}
export function assessRoute(route, samples, forecasts, start, activity = 'walk') {
    const unavailable = reason => ({ status: 'unavailable', points: [], score: null, reason });
    if (!validRoute(route) || !['walk','run','cycle'].includes(activity) || !Number.isFinite(start) || samples.length !== 5 || forecasts.length !== samples.length
        || forecasts.some(d => !d?.timezone || !d.hourly?.time?.length || !d.daily?.time?.length)) return unavailable('Some route weather is missing. Try again.');
    if (forecasts.some(d => d._jweather?.cached)) return { ...unavailable('Saved weather. Reconnect for a fresh route comparison.'), status: 'offline' };
    const end = start + route.duration*1000;
    let worst = null;
    const points = [];
    for (let i = 0; i < samples.length; i++) {
        const data = forecasts[i];
        const assessment = checkPlan(data, { start, end, activity }, start-1);
        if (assessment.status === 'unavailable') return unavailable(assessment.message);
        if (assessment.status === 'changed' && !worst) worst = assessment.message;
        const at = start + samples[i].fraction * route.duration*1000;
        let nearest = -1, delta = Infinity, forecastAt;
        data.hourly.time.forEach((time,index) => {
            const instant = localToUTC(time,data.timezone);
            if (instant !== null && Math.abs(instant-at) < delta) { delta = Math.abs(instant-at); nearest = index; forecastAt = instant; }
        });
        if (nearest < 0 || delta > HOUR/2) return unavailable('This route extends beyond the available hourly weather.');
        const reading = assessHour(data,nearest,activity);
        if (reading === null) return unavailable('Some hourly route readings are missing.');
        const hourly = data.hourly;
        points.push({ ...samples[i], at, forecastAt, zone: data.timezone, temperature: hourly.temperature_2m[nearest],
            rain: hourly.precipitation_probability[nearest], wind: hourly.wind_speed_10m[nearest],
            windDirection: Number.isFinite(hourly.wind_direction_10m?.[nearest]) ? hourly.wind_direction_10m[nearest] : null,
            code: hourly.weather_code[nearest], score: reading.score });
        if (assessment.window) points.at(-1).windowScore = assessment.window.score;
    }
    return { status: worst ? 'changed' : 'good', points, score: worst ? 0 : Math.min(...points.map(p => p.windowScore)),
        reason: worst || 'A comfortable fit at the sampled locations for the full moving time.' };
}
export function departureOptions(data, route, day, now = Date.now()) {
    if (!validRoute(route) || !data?.daily?.time?.includes(day) || !data.hourly?.time?.length) return [];
    const instants = data.hourly.time.map(t => localToUTC(t,data.timezone)).filter(t => t !== null);
    const earliest = Math.min(...instants), latest = Math.max(...instants)+HOUR;
    const result = [];
    for (let i=0;i<48;i++) {
        const time = day + 'T' + String(Math.floor(i/2)).padStart(2,'0') + ':' + (i%2 ? '30' : '00');
        const start = localToUTC(time,data.timezone);
        if (start !== null && start >= now+300000 && start >= earliest && start+route.duration*1000 <= latest
            && localParts(start,data.timezone).slice(0,10) === day) result.push(start);
    }
    return result;
}
