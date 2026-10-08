// Capture the real interface with a repeatable example forecast for documentation.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/screenshots/', import.meta.url);
const base = 'http://127.0.0.1:8080/Jweather/';
let server;
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
    try { return (await fetch(base)).ok; } catch { return false; }
}
try {
    await mkdir(output, { recursive: true });
    if (!await ready()) {
        server = spawn(process.execPath, ['tests/server.mjs'], { cwd: root, stdio: 'ignore' });
        for (let i = 0; i < 50 && !await ready(); i++) await delay(100);
        if (!await ready()) throw new Error('Screenshot server did not start.');
    }
    browser = await chromium.launch({
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {})
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 },
        deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', timezoneId: 'Europe/Lisbon' });
    await page.clock.install({ time: new Date('2026-10-08T16:45:00Z') });
    const hours = Array.from({ length: 48 }, (_, i) => `2026-10-${i < 24 ? '08' : '09'}T${String(i % 24).padStart(2, '0')}:00`);
    const preview = {
        ...fixture,
        timezone: 'Europe/Lisbon',
        current: { ...fixture.current, time: '2026-10-08T17:45', temperature_2m: 21.6,
            apparent_temperature: 21.2, relative_humidity_2m: 64, weather_code: 0, wind_speed_10m: 13.8, wind_direction_10m: 285 },
        daily: { ...fixture.daily, weather_code: [0, 0, 2, 3, 61, 0], temperature_2m_max: [23, 24, 23, 21, 22, 23],
            temperature_2m_min: [17, 17, 16, 15, 16, 17], precipitation_probability_max: [5, 5, 10, 20, 55, 5],
            sunrise: fixture.daily.time.map(d => `${d}T07:30`), sunset: fixture.daily.time.map(d => `${d}T18:45`) },
        hourly: { time: hours, temperature_2m: hours.map((_, i) => Math.round(19 + 3 * Math.cos((i % 24 - 15) * Math.PI / 12))),
            apparent_temperature: hours.map((_, i) => Math.round(19 + 3 * Math.cos((i % 24 - 15) * Math.PI / 12))),
            weather_code: Array(48).fill(0), precipitation_probability: Array(48).fill(5), precipitation: Array(48).fill(0),
            wind_speed_10m: Array(48).fill(9), wind_gusts_10m: Array(48).fill(15),
            uv_index: Array(48).fill(2), cloud_cover: Array(48).fill(25) }
    };
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: preview }));
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL('home.png', output)), fullPage: true });
    await page.goto(base + 'weather.html?lat=38.7223&lon=-9.1393&name=Lisbon&country=Portugal');
    await page.locator('#weather-content').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL('forecast-light.png', output)), fullPage: true });
    await page.locator('#outside-section').screenshot({ path: fileURLToPath(new URL('time-outside.png', output)) });
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await page.locator('#calendar-dialog').screenshot({ path: fileURLToPath(new URL('calendar.png', output)) });
    await page.getByRole('button', { name: 'Close calendar' }).click();
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.evaluate(() => window.JweatherTheme.setPreference('dark'));
    await page.screenshot({ path: fileURLToPath(new URL('forecast-dark.png', output)), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: fileURLToPath(new URL('forecast-mobile.png', output)), fullPage: true });
    console.log('Saved six interface screenshots to docs/screenshots/ (example forecast data).');
} finally {
    await browser?.close();
    server?.kill();
}
