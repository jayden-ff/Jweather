import { test, expect } from '@playwright/test';

const geocoding = { results: [
    { name: 'Berlin', country: 'Deutschland', admin1: 'Berlin', latitude: 52.52, longitude: 13.405 },
    { name: 'Berlin', country: 'Vereinigte Staaten', admin1: 'New Hampshire', latitude: 44.46, longitude: -71.18 }
] };
const dates = Array.from({ length: 6 }, (_, i) => `2026-10-${String(8 + i).padStart(2, '0')}`);
const fixture = {
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
const weatherPath = 'weather.html?lat=52.52&lon=13.405&name=Berlin&country=Deutschland';
async function mockAPIs(page) {
    await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: geocoding }));
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
}
async function openWeather(page) {
    await mockAPIs(page);
    await page.goto(weatherPath);
    await expect(page.locator('#weather-content')).toBeVisible();
}

for (const width of [320, 390, 768, 1440]) {
    test(`home and weather fit a ${width}px viewport under a GitHub Pages project path`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const failedAssets = [];
        page.on('response', response => { if (response.url().includes('127.0.0.1') && response.status() >= 400) failedAssets.push(response.url()); });
        await page.goto('./');
        await expect(page.getByRole('heading', { name: 'Wetter. Ganz in Ruhe.' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.fonts.check('16px "DM Sans"') && document.fonts.check('16px "Instrument Serif"'))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await openWeather(page);
        await expect(page.locator('.forecast-item')).toHaveCount(5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width < 600) {
            const before = await page.locator('#hourly-list').evaluate(el => el.scrollLeft);
            await page.locator('#hourly-list').evaluate(el => { el.scrollLeft = 100; });
            expect(await page.locator('#hourly-list').evaluate(el => el.scrollLeft)).toBeGreaterThan(before);
        }
        expect(errors).toEqual([]);
        expect(failedAssets).toEqual([]);
    });
}

test('keyboard search opens the right location and displays current and future weather', async ({ page }) => {
    await mockAPIs(page);
    await page.goto('./');
    const input = page.getByRole('combobox');
    await input.fill('Berlin');
    await expect(page.getByRole('option')).toHaveCount(2);
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'place-0');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/Jweather\/weather.html\?.*name=Berlin/);
    await expect(page.locator('#temperature')).toHaveText('14°');
    await expect(page.locator('#feels-like')).toHaveText('11°C');
    await expect(page.locator('#humidity')).toHaveText('79 %');
    await expect(page.locator('#wind-speed')).toHaveText('20,6 km/h');
    await expect(page.locator('.hour-item')).toHaveCount(8);
    await expect(page.locator('.hour-time').first()).toHaveText('Jetzt');
    await expect(page.locator('.hour-time').nth(1)).toHaveText('15:00');
    await expect(page.locator('.forecast-item')).toHaveCount(5);
    await expect(page.locator('.forecast-day').first()).toHaveText('Morgen');
    await page.getByRole('link', { name: 'Anderer Ort' }).click();
    await expect(page.locator('#recent-links')).toContainText('Berlin');
});

test('temperature units convert without another API request and persist across reload', async ({ page }) => {
    let calls = 0;
    await page.route('https://api.open-meteo.com/**', route => { calls++; return route.fulfill({ json: fixture }); });
    await page.goto(weatherPath);
    await expect(page.locator('#temperature')).toHaveText('14°');
    await page.getByRole('button', { name: '°F', exact: true }).click();
    await expect(page.locator('#temperature')).toHaveText('56°');
    await expect(page.locator('#feels-like')).toHaveText('51°F');
    await expect(page.locator('.forecast-temp').first()).toHaveText('68°52°');
    expect(calls).toBe(1);
    await page.reload();
    await expect(page.locator('#temperature')).toHaveText('56°');
    await expect(page.getByRole('button', { name: '°F', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('day details work with keyboard, return focus, and close on the backdrop', async ({ page }) => {
    await openWeather(page);
    const tomorrow = page.locator('.forecast-item').first();
    await tomorrow.focus();
    await tomorrow.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#modal-details')).toContainText('0 mm');
    await expect(page.locator('#modal-description')).toHaveText('Klarer Himmel');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(tomorrow).toBeFocused();
    await tomorrow.click();
    await page.mouse.click(5, 5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await tomorrow.click();
    await page.getByRole('button', { name: 'Details schließen' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('failed forecasts show a useful error and can be retried', async ({ page }) => {
    let calls = 0;
    await page.route('https://api.open-meteo.com/**', route => ++calls === 1
        ? route.fulfill({ status: 503, json: { error: true } }) : route.fulfill({ json: fixture }));
    await page.goto(weatherPath);
    await expect(page.locator('#load-title')).toHaveText('Gerade keine Aussicht.');
    await expect(page.locator('#load-message')).toContainText('nicht erreichbar');
    await expect(page.locator('#weather-content')).not.toBeVisible();
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.locator('#weather-content')).toBeVisible();
    await expect(page.locator('#main')).toHaveAttribute('aria-busy', 'false');
    expect(calls).toBe(2);
});

test('incomplete weather responses never produce invented or undefined weather', async ({ page }) => {
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { ...fixture, current: {} } }));
    await page.goto(weatherPath);
    await expect(page.locator('#load-message')).toContainText('unvollständig');
    await expect(page.locator('#weather-content')).not.toBeVisible();
    await expect(page.locator('body')).not.toContainText('undefined');
});

test('a non-JSON provider response produces a readable error', async ({ page }) => {
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ body: '<html>Unavailable</html>', contentType: 'text/html' }));
    await page.goto(weatherPath);
    await expect(page.locator('#load-message')).toHaveText('Die Antwort des Wetterdienstes ist gerade unvollständig. Bitte versuche es erneut.');
    await expect(page.locator('#weather-content')).not.toBeVisible();
});

for (const query of ['', '?lat=91&lon=0', '?lat=0&lon=181', '?lat=&lon=0', '?lat=nope&lon=0']) {
    test(`invalid location ${query || '(missing)'} does not request weather`, async ({ page }) => {
        let calls = 0;
        await page.route('https://api.open-meteo.com/**', route => { calls++; return route.fulfill({ json: fixture }); });
        await page.goto('weather.html' + query);
        await expect(page.locator('#load-message')).toContainText('gültiger Ort');
        await expect(page.getByRole('button', { name: 'Erneut versuchen' })).not.toBeVisible();
        await expect(page.getByRole('link', { name: 'Anderen Ort suchen' })).toBeVisible();
        expect(calls).toBe(0);
    });
}

test('empty results, network failure and escape leave search usable', async ({ page }) => {
    await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: {} }));
    await page.goto('./');
    const input = page.getByRole('combobox');
    await input.fill('xyzxyzxyz');
    await expect(page.locator('#search-status')).toContainText('Kein Ort gefunden');
    await page.route('https://geocoding-api.open-meteo.com/**', route => route.abort('failed'));
    await input.fill('Berlin');
    await expect(page.locator('#search-status')).toContainText('Keine Verbindung');
    await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: geocoding }));
    await input.press('Enter');
    await expect(page.getByRole('option')).toHaveCount(2);
    await input.press('Escape');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('a slow previous query cannot replace the latest results', async ({ page }) => {
    await page.route('https://geocoding-api.open-meteo.com/**', async route => {
        const query = new URL(route.request().url()).searchParams.get('name');
        if (query === 'Berlin') {
            await new Promise(resolve => setTimeout(resolve, 700));
            await route.fulfill({ json: geocoding }).catch(() => {});
        } else await route.fulfill({ json: { results: [{ ...geocoding.results[0], name: 'Hamburg' }] } });
    });
    await page.goto('./');
    const input = page.getByRole('combobox');
    await input.fill('Berlin');
    await expect(page.locator('#search-status')).toContainText('Wir suchen');
    await input.fill('Hamburg');
    await expect(page.getByRole('option')).toContainText('Hamburg');
    await page.waitForTimeout(800);
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toContainText('Hamburg');
});

test('non-ASCII names and HTML-like names are treated as plain text', async ({ page }) => {
    await mockAPIs(page);
    const name = 'München 100% <img src=x onerror=alert(1)>';
    const alerts = [];
    page.on('dialog', dialog => { alerts.push(dialog.message()); dialog.dismiss(); });
    await page.goto('weather.html?' + new URLSearchParams({ lat: '48.1351', lon: '11.582', name }));
    await expect(page.locator('#location-name')).toHaveText(name);
    await expect(page.locator('#location-name img')).toHaveCount(0);
    expect(alerts).toEqual([]);
});

test('geolocation success navigates to the current coordinates', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 48.1351, longitude: 11.582 });
    await mockAPIs(page);
    await page.goto('./');
    await page.getByRole('button', { name: 'Meinen Standort verwenden' }).click();
    await expect(page).toHaveURL(/lat=48.1351&lon=11.582&name=Dein\+Standort/);
    await expect(page.locator('#location-name')).toHaveText('Dein Standort');
});

test('denied geolocation offers manual search and reenables the button', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: {
        getCurrentPosition(_success, failure) { failure({ code: 1 }); }
    } }));
    await page.goto('./');
    await page.getByRole('button', { name: 'Meinen Standort verwenden' }).click();
    await expect(page.locator('#search-status')).toContainText('Standortzugriff nicht erlaubt');
    await expect(page.getByRole('button', { name: 'Meinen Standort verwenden' })).toBeEnabled();
});

test('blocked storage and reduced motion keep the whole weather flow functional', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
        Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
        Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
    });
    await openWeather(page);
    await page.getByRole('button', { name: '°F', exact: true }).click();
    await expect(page.locator('#temperature')).toHaveText('56°');
    expect(await page.locator('.reveal').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.locator('.forecast-item').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
});
