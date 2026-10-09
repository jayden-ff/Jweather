import { test, expect } from '@playwright/test';
import { forecast, placePath, now } from './journey-fixtures.mjs';
test.use({ serviceWorkers: 'allow' });

test('a first visit saves the shell and forecast, then works offline with honest freshness', async ({ page, context }) => {
    await page.clock.install({ time: new Date(now) });
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await page.goto(placePath);
    await expect(page.locator('#weather-content')).toBeVisible();
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    await page.locator('#favorite-place').click();
    await page.waitForFunction(async () => !!navigator.serviceWorker.controller && (await (await caches.open('jweather-forecasts-v1')).keys()).length === 1);
    const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
    expect(manifest.start_url).toBe('./index.html'); expect(manifest.scope).toBe('./');
    expect(manifest.icons.map(icon => icon.sizes)).toEqual(['192x192', '512x512']);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#temperature')).toHaveText('14°');
    await expect(page.locator('#forecast-notice')).toContainText('Saved forecast');
    await expect(page.locator('#current-title')).toHaveText('Saved conditions');
    await expect(page.locator('.moment-title')).toHaveText('Reconnect for a fresh moment.');
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'offline');
    await expect(page.locator('.moment-add')).toHaveCount(0);
    await page.goto('index.html');
    await expect(page.locator('#myday-content')).toContainText('Your last forecast.');
    await expect(page.locator('#favorite-links')).toContainText('Berlin');
    await page.goto('weather.html?lat=40&lon=10&name=Never+visited');
    await expect(page.locator('#load-title')).toHaveText('Weather unavailable.');
    const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat());
    expect(keys.some(url => /calendar-callback|googleapis|microsoftonline|tile.openstreetmap/.test(url))).toBe(false);
});
test('the forecast cache stays bounded and excludes authenticated requests', async ({ page }) => {
    await page.clock.install({ time: new Date(now) });
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await page.goto(placePath);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(data => Promise.all(Array.from({ length: 25 }, (_, i) => new Promise(resolve => {
        const channel = new MessageChannel(); channel.port1.onmessage = () => resolve();
        navigator.serviceWorker.controller.postMessage({ type: 'CACHE_FORECAST',
            url: `https://api.open-meteo.com/v1/forecast?latitude=${i}&longitude=10`, data, savedAt: new Date().toISOString() }, [channel.port2]);
    }))), forecast());
    const keys = await page.evaluate(async () => (await (await caches.open('jweather-forecasts-v1')).keys()).map(request => request.url));
    expect(keys).toHaveLength(20);
    expect(keys.some(url => url.includes('latitude=0&'))).toBe(false);
    // An authenticated request must go directly to the network, not the public cache.
    await page.evaluate(async () => { try { await fetch('https://api.open-meteo.com/v1/forecast?latitude=45&longitude=10', { headers: { Authorization: 'Bearer example' } }); } catch {} });
    const stored = await page.evaluate(async () => !!await (await caches.open('jweather-forecasts-v1')).match('https://api.open-meteo.com/v1/forecast?latitude=45&longitude=10'));
    expect(stored).toBe(false);
});
test('installation help is accessible and describes the browser-specific action', async ({ page }) => {
    await page.goto('index.html');
    await page.getByRole('button', { name: 'Get the app ↗', exact: true }).click();
    await expect(page.locator('#install-dialog')).toContainText('Install app or Add to Home screen');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Get the app ↗', exact: true })).toBeFocused();
});
