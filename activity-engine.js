// Forecast-based suggestions. All thresholds use Celsius, km/h and millimetres.
export const activities = {
    walk: { label: 'Walk', title: 'A good time for a walk.', event: 'A little time for a walk', comfortable: [10, 24], maxWind: 28, maxGust: 42, maxHeat: 33, maxRain: .4 },
    run: { label: 'Run', title: 'Room for a run.', event: 'A little time for a run', comfortable: [8, 20], maxWind: 25, maxGust: 38, maxHeat: 28, maxRain: .3 },
    cycle: { label: 'Cycle', title: 'A good time for a ride.', event: 'A little time for a ride', comfortable: [12, 25], maxWind: 20, maxGust: 32, maxHeat: 32, maxRain: .2 },
    sunset: { label: 'Sunset', title: 'Catch the last light.', event: 'A moment for the sunset', comfortable: [10, 25], maxWind: 28, maxGust: 42, maxHeat: 33, maxRain: .2 }
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const HOUR = 3600000;
const forbiddenCodes = new Set([48, 56, 57, 65, 66, 67, 75, 82, 86, 95, 96, 99]);
const formatters = new Map();
function formatter(zone) {
    if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
    return formatters.get(zone);
}
export function localParts(instant, zone) {
    const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute + ':' + parts.second;
}
export function localToUTC(wallTime, zone) {
    if (typeof wallTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(wallTime)) return null;
    const target = wallTime.length === 16 ? wallTime + ':00' : wallTime;
    const nominal = Date.parse(target + 'Z');
    if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== target) return null;
    try {
        let guess = nominal;
        for (let i = 0; i < 4; i++) {
            const displayed = Date.parse(localParts(guess, zone) + 'Z');
            guess += nominal - displayed;
        }
        // Do not guess an instant in a missing or repeated daylight-saving hour.
        const matches = [];
        for (let offset = -2 * HOUR; offset <= 2 * HOUR; offset += HOUR / 2) {
            const candidate = guess + offset;
            if (localParts(candidate, zone) === target) matches.push(candidate);
        }
        return matches.length === 1 ? matches[0] : null;
    } catch { return null; }
}
function reading(data, key, index) {
    const value = data.hourly[key]?.[index];
    return finite(value) ? value : null;
}
function assess(data, index, profile, activity) {
    const temperature = reading(data, 'temperature_2m', index);
    const apparent = reading(data, 'apparent_temperature', index) ?? temperature;
    const rain = reading(data, 'precipitation_probability', index);
    const amount = reading(data, 'precipitation', index);
    const wind = reading(data, 'wind_speed_10m', index);
    const gust = reading(data, 'wind_gusts_10m', index);
    const code = reading(data, 'weather_code', index);
    const cloud = reading(data, 'cloud_cover', index);
    const uv = reading(data, 'uv_index', index);
    if ([temperature, apparent, rain, amount, wind, gust, code, uv].some(v => v === null)) return null;
    if (rain < 0 || rain > 100 || amount < 0 || wind < 0 || gust < 0) return null;
    if (forbiddenCodes.has(code) || code === 45 || code === 77 || !Number.isInteger(code)
        || ![0, 1, 2, 3, 51, 53, 55, 61, 63, 71, 73, 80, 81, 85].includes(code)) return { score: 0 };
    if (temperature < 2 || apparent < 0 || apparent > profile.maxHeat || rain > 35
        || amount > profile.maxRain || wind > profile.maxWind || gust > profile.maxGust
        || (finite(uv) && uv >= 8)) return { score: 0 };
    if (activity === 'sunset' && (cloud === null || cloud < 0 || cloud > 85 || code > 3)) return { score: 0 };
    const [min, max] = profile.comfortable;
    const distance = Math.max(0, min - apparent, apparent - max);
    const score = Math.max(0, Math.min(100, 100 - rain * .6 - Math.max(0, wind - 8) * 1.2
        - Math.max(0, gust - 22) * .6 - distance * 3 - Math.max(0, (uv ?? 0) - 4) * 4
        - (activity === 'sunset' ? Math.max(0, cloud - 45) * .5 : 0)));
    return { score, temperature, rain, wind, gust, cloud, uv };
}
export function findWindows(data, options = {}) {
    const activity = Object.hasOwn(activities, options.activity) ? options.activity : 'walk';
    const profile = activities[activity];
    const duration = activity === 'sunset' ? 45 : ([30, 60, 90].includes(options.duration) ? options.duration : 60);
    const zone = data.timezone;
    const current = localToUTC(data.current?.time, zone);
    const now = Math.max(options.now ?? Date.now(), current ?? 0);
    const today = localParts(now, zone).slice(0, 10);
    const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 24 * HOUR).toISOString().slice(0, 10);
    const hours = data.hourly.time.map((time, index) => ({
        time, start: localToUTC(time, zone), index, reading: assess(data, index, profile, activity)
    })).filter(h => h.start !== null);
    const days = new Map(data.daily.time.map((date, index) => [date, {
        rise: localToUTC(data.daily.sunrise?.[index], zone),
        set: localToUTC(data.daily.sunset?.[index], zone)
    }]));
    for (const hour of hours) {
        const solar = days.get(hour.time.slice(0, 10));
        hour.daylight = Boolean(solar && solar.rise !== null && solar.set !== null && hour.start + HOUR > solar.rise && hour.start < solar.set);
    }
    const candidates = [];
    let incomplete = false;
    for (const h of hours) {
        const date = h.time.slice(0, 10);
        if (options.day === 'today' && date !== today || options.day === 'tomorrow' && date !== tomorrow) continue;
        const solar = days.get(date);
        if (!solar || solar.rise === null || solar.set === null) { incomplete = true; continue; }
        const starts = activity === 'sunset' ? [solar.set - duration * 60000] : [h.start, h.start + HOUR / 2];
        for (const start of starts) {
            if (activity === 'sunset' && !(start >= h.start && start < h.start + HOUR)) continue;
            const end = start + duration * 60000;
            const horizon = [72, 144].includes(options.horizonHours) ? options.horizonHours : 72;
            if (start < now + 5 * 60000 || end > now + horizon * HOUR || start < solar.rise || end > solar.set) continue;
            if (Array.isArray(options.dates) && !options.dates.includes(date)) continue;
            const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
            if (Array.isArray(options.weekdays) && !options.weekdays.includes(weekday)) continue;
            const wallStart = localParts(start, zone).slice(11, 16);
            const wallEnd = localParts(end, zone).slice(11, 16);
            if (typeof options.earliest === 'string' && wallStart < options.earliest
                || typeof options.latest === 'string' && wallEnd > options.latest) continue;
            const localHour = Number(localParts(start, zone).slice(11, 13));
            if (options.period === 'morning' && localHour >= 12 || options.period === 'afternoon' && (localHour < 12 || localHour >= 17)
                || options.period === 'evening' && localHour < 17) continue;
            const sampled = hours.filter(hour => hour.start < end && hour.start + HOUR > start).sort((a, b) => a.start - b.start);
            if (!sampled.length || sampled[0].start > start || sampled.at(-1).start + HOUR < end
                || sampled.some((hour, i) => i && hour.start !== sampled[i - 1].start + HOUR)) continue;
            if (sampled.some(hour => hour.reading === null)) { incomplete = true; continue; }
            if (sampled.some(hour => hour.reading.score < 55)) continue;
            const readings = sampled.map(hour => hour.reading);
            const score = Math.min(...readings.map(r => r.score));
            candidates.push({
                activity, duration, start, end, date, zone, score,
                minTemperature: Math.min(...readings.map(r => r.temperature)),
                maxTemperature: Math.max(...readings.map(r => r.temperature)),
                rain: Math.max(...readings.map(r => r.rain)),
                wind: Math.max(...readings.map(r => r.wind)),
                gust: Math.max(...readings.map(r => r.gust)),
                cloud: activity === 'sunset' ? Math.max(...readings.map(r => r.cloud)) : null
            });
        }
    }
    // Prefer near-term suggestions when conditions are comparable; show distinct alternatives.
    candidates.sort((a, b) => (b.score - (b.start - now) / HOUR * .15) - (a.score - (a.start - now) / HOUR * .15) || a.start - b.start);
    const windows = [];
    for (const candidate of candidates) {
        if (windows.every(w => candidate.end + HOUR / 2 <= w.start || candidate.start >= w.end + HOUR / 2)) windows.push(candidate);
        if (windows.length === 3) break;
    }
    return { windows, incomplete, today, hours, activity };
}
export function checkPlan(data, plan, now = Date.now()) {
    if (plan.end <= now) return { status: 'past', message: 'This moment has passed.' };
    if (plan.start <= now) return { status: 'ongoing', message: 'Your activity is underway.' };
    if (data._jweather?.cached) return { status: 'offline', message: 'Saved forecast. Check again for fresh weather.' };
    const zone = data.timezone;
    const profile = activities[plan.activity];
    if (!profile || !Array.isArray(data.hourly?.time) || !Array.isArray(data.daily?.time)) return { status: 'unavailable', message: 'This forecast is incomplete.' };
    const date = localParts(plan.start, zone).slice(0, 10);
    const day = data.daily.time.indexOf(date);
    const rise = localToUTC(data.daily.sunrise?.[day], zone);
    const set = localToUTC(data.daily.sunset?.[day], zone);
    if (rise === null || set === null) return { status: 'unavailable', message: 'This plan is outside the current forecast.' };
    if (plan.start < rise || plan.end > set) return { status: 'changed', message: 'This activity now falls outside daylight.' };
    const hours = data.hourly.time.map((time, index) => ({ start: localToUTC(time, zone), index }))
        .filter(h => h.start !== null && h.start < plan.end && h.start + HOUR > plan.start).sort((a, b) => a.start - b.start);
    if (!hours.length || hours[0].start > plan.start || hours.at(-1).start + HOUR < plan.end
        || hours.some((h, i) => i && h.start !== hours[i - 1].start + HOUR)) return { status: 'unavailable', message: 'Some hourly readings are missing.' };
    const readings = hours.map(h => assess(data, h.index, profile, plan.activity));
    if (readings.some(r => r === null)) return { status: 'unavailable', message: 'Some hourly readings are missing.' };
    if (readings.some(r => r.score < 55)) {
        const codes = hours.map(h => data.hourly.weather_code[h.index]);
        const rain = hours.map(h => reading(data, 'precipitation_probability', h.index));
        const wind = hours.map(h => reading(data, 'wind_speed_10m', h.index));
        return { status: 'changed', message: codes.some(c => c >= 95) ? 'Thunderstorms are now forecast.'
            : rain.some(r => r > 35) ? 'Rain now looks more likely.' : wind.some(w => w > profile.maxWind)
                ? 'The wind now looks too strong.' : 'Conditions no longer look like a good fit.' };
    }
    const window = { ...plan, minTemperature: Math.min(...readings.map(r => r.temperature)), maxTemperature: Math.max(...readings.map(r => r.temperature)),
        rain: Math.max(...readings.map(r => r.rain)), wind: Math.max(...readings.map(r => r.wind)), gust: Math.max(...readings.map(r => r.gust)),
        score: Math.min(...readings.map(r => r.score)), zone };
    return { status: 'good', message: 'Still looks good.', window };
}
export function clockTime(instant, zone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(instant);
}
export function dayLabel(date, today) {
    if (date === today) return 'Today';
    if (date === new Date(Date.parse(today + 'T12:00Z') + 24 * HOUR).toISOString().slice(0, 10)) return 'Tomorrow';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(date + 'T12:00Z'));
}
