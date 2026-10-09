import { test, expect } from '@playwright/test';
import { forecast, berlin, placePath, now, parks, routeFixture } from './journey-fixtures.mjs';

async function open(page, path = placePath) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date(now) });
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await page.goto(path);
    await expect(page.locator('.moment-time')).toBeVisible();
}
async function maps(page, duration = 1800) {
    const calls = [];
    await page.route('https://overpass-api.de/**', route => route.fulfill({ json: parks }));
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9e5db"/></svg>' }));
    await page.route('https://routing.openstreetmap.de/**', route => {
        calls.push(route.request().url());
        const data = routeFixture(route.request().url()); data.routes[0].duration = duration;
        return route.fulfill({ json: data });
    });
    return calls;
}

test('removing and undoing a plan preserves its calendar link and keeps save controls in sync', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    const original = await page.evaluate(async () => {
        const store = await import('./personal-store.js?v=20261009.1');
        const plan = store.getState().plans[0];
        store.linkCalendar(plan.id, 'google', 'existing-calendar-event');
        return store.getState().plans[0];
    });
    await page.locator('.plan-card').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('.plan-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save plan', exact: true })).toBeEnabled();
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeFocused();
    await page.clock.fastForward(15000);
    await expect(undo).toBeVisible();
    await undo.press('Enter');
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'good');
    await expect(page.locator('#save-moment')).toHaveText('Saved ✓');
    await expect(page.locator('#save-moment')).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans[0])).toEqual(original);
    await expect(page.locator('#plans-tab')).toBeFocused();
    await page.locator('.plan-card').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans)).toEqual([original]);
    await page.getByRole('button', { name: 'Check weather ↻', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check weather ↻', exact: true })).toBeFocused();
});

test('Find a route follows the selected activity even after the map has already been used', async ({ page }) => {
    const calls = await maps(page);
    await open(page);
    await page.getByRole('button', { name: 'Find a route', exact: true }).click();
    await expect(page.locator('#map-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.route-card')).toHaveCount(2);
    await expect(page.locator('.route-select').first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.route-select').nth(1).click();
    await expect(page.locator('.route-select').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.route-select').first()).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-activity-choice="cycle"]').click();
    await page.getByRole('button', { name: 'Find a route', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Route activity' }).getByRole('button', { name: 'Cycle', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.route-card')).toHaveCount(2);
    expect(calls.some(url => url.includes('/routed-bike/'))).toBe(true);
});

test('route saving updates when the available weather window changes', async ({ page }) => {
    const calls = await maps(page, 4200);
    await open(page);
    await page.getByRole('button', { name: 'Find a route', exact: true }).click();
    await expect(page.locator('.route-card')).toHaveCount(2);
    await expect(page.locator('.route-save').first()).toBeDisabled();
    await expect(page.locator('.route-fit').first()).toContainText('70 minutes');
    await page.locator('#outside-preferences summary').click();
    await page.locator('#outside-duration').selectOption('90');
    await expect(page.locator('.route-save').first()).toBeEnabled();
    await page.locator('.route-save').first().click();
    await expect(page.locator('.route-save').first()).toHaveText('Saved ✓');
    await expect(page.locator('.route-save').first()).toBeDisabled();
    expect(calls).toHaveLength(2);
    await page.locator('#plans-tab').click();
    await page.locator('.plan-card').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.locator('#map-tab').click();
    await expect(page.locator('.route-save').first()).toBeEnabled();
});

test('place search supports keyboard selection without selecting a favorite while a new search is pending', async ({ page }) => {
    await open(page);
    await page.locator('#favorite-place').click();
    await page.route('https://geocoding-api.open-meteo.com/**', async route => {
        await new Promise(resolve => setTimeout(resolve, 350));
        return route.fulfill({ json: { results: [{ ...berlin, latitude: 52.53, name: 'Berlin Mitte' }, { ...berlin, latitude: 52.54, name: 'Berlin West' }] } });
    });
    await page.locator('[data-edit-profile]').click();
    await page.locator('#profile-dialog').getByRole('button', { name: '+ Add a place', exact: true }).click();
    const input = page.getByRole('searchbox', { name: 'Find a place' });
    await input.fill('Berlin'); await input.press('Enter');
    await expect(page.locator('#place-picker')).toBeVisible();
    await expect(page.locator('.picker-results .picker-result')).toHaveCount(2);
    await input.press('ArrowDown');
    await expect(page.locator('.picker-results .picker-result').first()).toBeFocused();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(page.locator('#profile-dialog')).toContainText('Berlin West ×');
    await expect(page.locator('#profile-dialog .dialog-close')).toBeFocused();
});

test('personal hours keep their preset label accurate and sunset has its own duration', async ({ page }) => {
    await open(page);
    await page.locator('[data-edit-profile]').click();
    await expect(page.locator('#profile-preset')).toHaveValue('evening');
    await page.locator('#profile-from').fill('16:30');
    await expect(page.locator('#profile-preset')).toHaveValue('custom');
    await page.locator('#profile-activity').selectOption('sunset');
    await expect(page.locator('#profile-duration')).toBeHidden();
    await expect(page.locator('#profile-dialog')).toContainText('Sunset moments last 45 minutes');
    await page.getByRole('button', { name: 'Save my day', exact: true }).click();
    await expect(page.locator('.moment-badge')).toContainText('45 minutes');
    await page.locator('[data-edit-profile]').click();
    await expect(page.locator('#profile-preset')).toHaveValue('custom');
    await page.locator('#profile-activity').selectOption('walk');
    await expect(page.locator('#profile-duration')).toBeVisible();
});

test.describe('touch interface', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('the map permits page scrolling and point selection can be cancelled', async ({ page }) => {
        await maps(page); await open(page);
        await page.getByRole('button', { name: 'Find a route', exact: true }).click();
        await expect(page.locator('.route-card')).toHaveCount(2);
        const map = page.locator('#outdoor-map');
        await expect(map).not.toHaveClass(/leaflet-touch-drag/);
        expect(await map.evaluate(node => getComputedStyle(node).touchAction)).toContain('pan-y');
        await map.scrollIntoViewIfNeeded();
        const box = await map.boundingBox();
        const before = await page.evaluate(() => scrollY);
        const session = await page.context().newCDPSession(page);
        const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 10; i++) {
            await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 18 }] });
            await page.waitForTimeout(35);
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
        await session.detach();
        await page.getByRole('button', { name: 'Move map', exact: true }).click();
        await expect(map).toHaveClass(/leaflet-touch-drag/);
        await page.getByRole('button', { name: 'Done moving', exact: true }).click();
        await expect(map).not.toHaveClass(/leaflet-touch-drag/);
        await page.getByRole('button', { name: 'Choose destination', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: 'Cancel selection', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Choose destination', exact: true })).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByRole('button', { name: 'Cancel selection', exact: true })).toBeHidden();
    });
    test('a returning visitor sees My day before the decorative illustration', async ({ page }) => {
        await open(page);
        await page.locator('#favorite-place').click();
        await page.goto('index.html');
        await expect(page.locator('.myday-time')).toBeVisible();
        const day = await page.locator('.myday-section').boundingBox();
        const art = await page.locator('.weather-art').boundingBox();
        expect(day.y).toBeLessThan(art.y);
        await page.getByRole('combobox').focus();
        expect(await page.getByRole('combobox').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    });
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    test('a long place name and profile stay usable at ' + viewport.width + '×' + viewport.height, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, placePath.replace('name=Berlin', 'name=Frankfurt%20am%20Main'));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const control of [page.getByRole('button', { name: '°C', exact: true }), page.getByRole('button', { name: '°F', exact: true }), page.locator('#theme-picker summary'), page.locator('#favorite-place')]) {
            const box = await control.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await page.locator('[data-edit-profile]').click();
        const dialog = await page.locator('#profile-dialog').boundingBox();
        expect(dialog.y).toBeGreaterThanOrEqual(0); expect(dialog.y + dialog.height).toBeLessThanOrEqual(viewport.height);
        expect(await page.locator('#profile-dialog').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await page.locator('#profile-dialog').evaluate(node => { node.scrollTop = node.scrollHeight; });
        await page.getByRole('button', { name: 'Save my day', exact: true }).click();
        await expect(page.locator('#profile-dialog')).not.toBeVisible();
        if (viewport.width < 600) {
            await page.getByRole('navigation', { name: 'Forecast sections' }).getByRole('link', { name: 'Forecast', exact: true }).click();
            await expect(page.locator('#hourly-title')).toBeInViewport({ ratio: 1 });
            const title = await page.locator('#hourly-title').boundingBox();
            const navigation = await page.locator('.forecast-navigation').boundingBox();
            expect(title.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
        }
    });
}
