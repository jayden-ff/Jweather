export const geocoding = { results: [
    { name: 'Berlin', country: 'Germany', admin1: 'Berlin', latitude: 52.52, longitude: 13.405 },
    { name: 'Berlin', country: 'United States', admin1: 'New Hampshire', latitude: 44.46, longitude: -71.18 }
] };
const dates = Array.from({ length: 6 }, (_, i) => `2026-10-${String(8 + i).padStart(2, '0')}`);
export const fixture = {
    timezone: 'Europe/Berlin',
    current: { time: '2026-10-08T14:15', temperature_2m: 13.6, apparent_temperature: 10.6,
        relative_humidity_2m: 79, is_day: 1, weather_code: 61, wind_speed_10m: 20.6, wind_direction_10m: 286 },
    daily: { time: dates, weather_code: [61, 0, 3, 71, 95, 45],
        temperature_2m_max: [18, 20, 16, 8, 14, 15], temperature_2m_min: [10, 11, 9, 2, 8, 7],
        precipitation_probability_max: [80, 5, 30, 70, 90, 20], precipitation_sum: [4, 0, 1, 6, 10, 0],
        wind_speed_10m_max: [24, 12, 17, 20, 30, 10], uv_index_max: [2, 3, 2, 1, 2, 1],
        sunrise: dates.map(d => `${d}T07:15`), sunset: dates.map(d => `${d}T18:30`) },
    hourly: { time: Array.from({ length: 24 }, (_, i) => `2026-10-08T${String(i).padStart(2, '0')}:00`),
        temperature_2m: Array(24).fill(14), weather_code: Array(24).fill(0), precipitation_probability: Array(24).fill(15) }
};
