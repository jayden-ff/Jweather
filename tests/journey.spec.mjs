import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { forecast, berlin, placePath, now, parks, routeFixture } from './journey-fixtures.mjs';

async function open(page, data = forecast()) {
    await page.clock.install({ time: new Date(now) });
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: data }));
    await page.goto(placePath);
    await expect(page.locator('#weather-content')).toBeVisible();
}
async function maps(page, calls = []) {
    await page.route('https://overpass-api.de/**', route => route.fulfill({ json: parks }));
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9e5db"/></svg>' }));
    await page.route('https://routing.openstreetmap.de/**', route => {
        calls.push(route.request().url()); return route.fulfill({ json: routeFixture(route.request().url()) });
    });
}
test('favorite places and daily hours persist, with a useful recommendation on the home page', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Save this place', exact: true }).click();
    await expect(page.locator('#favorite-status')).toHaveText('Added to My day.');
    await page.locator('[data-edit-profile]').click();
    await page.locator('#profile-activity').selectOption('run');
    await page.locator('#profile-duration').selectOption('30');
    await page.locator('#profile-preset').selectOption('evening');
    await page.getByRole('button', { name: 'Save my day', exact: true }).click();
    await expect(page.locator('.moment-title')).toHaveText('Room for a run.');
    await expect(page.locator('.moment-time')).toHaveText('17:00–17:30');
    await page.goto('index.html');
    await expect(page.locator('.myday-time')).toHaveText('17:00–17:30');
    await expect(page.locator('#favorite-links')).toContainText('Berlin');
    await page.getByRole('button', { name: 'Save this moment', exact: true }).click();
    await expect(page.locator('#myday-content button')).toHaveText('Saved ✓');
    await page.locator('#home-plans summary').click();
    await expect(page.locator('.plan-card')).toContainText('Run · Berlin');
    await page.reload();
    await expect(page.locator('#myday-content button')).toHaveText('Saved ✓');
});
test('profile validates time and days and its search remains usable after a failed request', async ({ page }) => {
    await open(page);
    await page.locator('[data-edit-profile]').click();
    await page.locator('#profile-from').fill('18:00');
    await page.locator('#profile-to').fill('17:00');
    await page.getByRole('button', { name: 'Save my day', exact: true }).click();
    await expect(page.locator('#profile-dialog [role=status]')).toHaveText('Choose an end time after the start time.');
    await page.locator('#profile-to').fill('20:00');
    for (const input of await page.locator('.profile-days input').all()) await input.uncheck();
    await page.getByRole('button', { name: 'Save my day', exact: true }).click();
    await expect(page.locator('#profile-dialog [role=status]')).toHaveText('Choose at least one day.');
    await page.locator('#profile-dialog').getByRole('button', { name: '+ Add a place', exact: true }).click();
    let fail = true;
    await page.route('https://geocoding-api.open-meteo.com/**', route => fail ? route.abort() : route.fulfill({ json: { results: [berlin] } }));
    await page.getByRole('searchbox', { name: 'Find a place' }).fill('Berlin');
    await expect(page.locator('#place-picker [role=status]')).toContainText('could not load');
    fail = false;
    await page.getByRole('searchbox', { name: 'Find a place' }).fill('Berlin ');
    await page.locator('.picker-result').click();
    await expect(page.locator('#profile-dialog')).toContainText('Berlin ×');
});
test('home preferences become forecast defaults while later personal choices survive reload', async ({ page }) => {
    await open(page);
    await page.goto('index.html');
    await page.locator('[data-edit-profile]').click();
    await page.locator('#profile-activity').selectOption('run');
    await page.locator('#profile-duration').selectOption('30');
    await page.locator('#profile-preset').selectOption('evening');
    await page.getByRole('button', { name: 'Save my day', exact: true }).click();
    await page.goto(placePath);
    await expect(page.locator('.moment-title')).toHaveText('Room for a run.');
    await expect(page.locator('.moment-time')).toHaveText('17:00–17:30');
    await page.locator('[data-activity-choice=cycle]').click();
    await page.locator('#outside-preferences summary').click();
    await page.locator('#use-my-hours').uncheck();
    await page.reload();
    await page.locator('#outside-preferences summary').click();
    await expect(page.locator('[data-activity-choice=cycle]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#use-my-hours')).not.toBeChecked();
    await expect(page.locator('.moment-time')).toHaveText('14:30–15:00');
});
test('plans survive reload, check every covered hour and move only after confirmation', async ({ page }) => {
    const data = forecast();
    await open(page, data);
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'good');
    await page.reload();
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'good');
    const previous = await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans[0].start);
    data.hourly.weather_code[14] = 95;
    await page.getByRole('button', { name: 'Check weather ↻', exact: true }).click();
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'changed');
    await page.getByRole('button', { name: 'Find a better time ↗', exact: true }).click();
    await page.locator('.move-proposal').first().click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans[0].start)).toBe(previous);
    await page.getByRole('button', { name: 'Move saved plan', exact: true }).click();
    await expect(page.locator('#move-plan-dialog [role=status]')).toHaveText('Your plan has moved.');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans[0].start)).toBeGreaterThan(previous);
    await page.keyboard.press('Escape');
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'good');
});
test('the share fallback stays selectable and the invitation can be saved from a fresh browser', async ({ page, context }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { value: undefined });
        Object.defineProperty(navigator, 'clipboard', { value: undefined });
    });
    await open(page);
    await page.locator('.moment-actions').getByRole('button', { name: 'Share', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Plan link', exact: true });
    await expect(input).toBeVisible();
    const url = await input.inputValue();
    const next = await context.newPage();
    await next.clock.install({ time: new Date(now) });
    await next.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await next.goto(url);
    await expect(next.locator('#shared-plan')).toContainText('An invitation outside');
    await next.getByRole('button', { name: 'Save this plan', exact: true }).click();
    await expect(next.locator('.plan-card')).toHaveAttribute('data-fit', 'good');
    await next.locator('.plan-card').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(next.locator('.plans-empty')).toBeVisible();
});
test('comparison uses the same day, excludes storms and reuses the current forecast', async ({ page }) => {
    await page.clock.install({ time: new Date(now) });
    const munich = { ...berlin, name: 'Munich', latitude: 48.137, longitude: 11.575 };
    const london = { ...berlin, name: 'London', latitude: 51.5, longitude: -.12 };
    await page.addInitScript(value => localStorage.setItem('jweather.personal.v1', JSON.stringify({ favorites: value })), [munich, london]);
    let calls = 0;
    await page.route('https://api.open-meteo.com/**', route => {
        calls++;
        const data = forecast(); const lat = Number(new URL(route.request().url()).searchParams.get('latitude'));
        if (lat === munich.latitude) data.hourly.weather_code.fill(95);
        if (lat === london.latitude) data.hourly.precipitation_probability.fill(30);
        return route.fulfill({ json: data });
    });
    await page.goto(placePath);
    await page.locator('#compare-tab').click();
    await expect(page.locator('.comparison-card')).toHaveCount(3);
    await expect(page.locator('.comparison-card[data-best=true] h4')).toHaveText('Berlin');
    await expect(page.locator('.comparison-card').filter({ hasText: 'Munich' })).toContainText('No comfortable window');
    expect(calls).toBe(3);
    await expect(page.locator('.comparison-day')).toHaveText(['Tomorrow', 'Tomorrow']);
    await page.getByRole('combobox', { name: 'Comparison day' }).selectOption('weekend');
    await expect(page.locator('.comparison-day').first()).toContainText('Sat');
    await expect(page.locator('.comparison-cards')).not.toContainText('Tomorrow');
    expect(calls).toBe(3);
    await page.locator('#plans-tab').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#compare-tab')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#plans-tab')).toBeFocused();
});
test('map lazily loads real routing profiles, respects park access and exports the actual track', async ({ page }) => {
    const calls = [];
    await maps(page, calls); await open(page);
    expect(calls).toHaveLength(0);
    expect(await page.evaluate(() => !!window.L)).toBe(false);
    await page.locator('#map-tab').click();
    await expect(page.locator('.route-card')).toHaveCount(2);
    await expect(page.locator('#map-panel')).not.toContainText('Private gardens');
    expect(calls.every(url => url.includes('/routed-foot/route/v1/foot/'))).toBe(true);
    await expect(page.locator('.leaflet-overlay-pane .route-line')).toHaveCount(1);
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download GPX ↓', exact: true }).first().click()]);
    const gpx = await readFile(await download.path(), 'utf8');
    expect(gpx).toContain('<trkpt lat="52.52" lon="13.405">');
    expect((gpx.match(/<trkpt /g) || []).length).toBe(5);
    await expect(page.getByRole('link', { name: 'Directions ↗', exact: true }).first()).toHaveAttribute('href', /travelmode=walking/);
    await page.getByRole('group', { name: 'Route activity' }).getByRole('button', { name: 'Cycle', exact: true }).click();
    await expect(page.locator('.route-card')).toHaveCount(2);
    expect(calls.some(url => url.includes('/routed-bike/route/v1/bike/'))).toBe(true);
    await expect(page.getByRole('link', { name: 'Directions ↗', exact: true }).first()).toHaveAttribute('href', /travelmode=bicycling/);
    await expect(page.locator('[data-activity-choice=cycle]')).toHaveAttribute('aria-pressed', 'true');
});
test('a user can choose a destination on the map and unavailable paths are reported honestly', async ({ page }) => {
    await maps(page); await open(page);
    await page.locator('#map-tab').click();
    await expect(page.locator('.route-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await page.locator('#outdoor-map').click({ position: { x: 250, y: 160 } });
    await expect(page.locator('.route-card')).toHaveCount(1);
    await expect(page.locator('.route-card')).toContainText('Your destination');
    await page.route('https://routing.openstreetmap.de/**', route => route.fulfill({ json: { code: 'NoRoute', routes: [] } }));
    await page.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await page.locator('#outdoor-map').click({ position: { x: 300, y: 180 } });
    await expect(page.locator('#map-panel .journey-status')).toContainText('No mapped route');
});
test('blocked storage is clearly reported while favorites and saving remain usable', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
    await open(page);
    await page.locator('#favorite-place').click();
    await expect(page.locator('#favorite-status')).toContainText('Saved for this visit');
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(page.locator('#moment-copy [role=status]')).toContainText('Browser storage is unavailable');
    await expect(page.locator('.plan-card')).toHaveAttribute('data-fit', 'good');
});
test('map labels keep names from location links as plain text', async ({ page }) => {
    await maps(page); await open(page);
    await page.goto(placePath.replace('name=Berlin', 'name=' + encodeURIComponent('<img src=x onerror="window.labelInjected=true">')));
    await page.locator('#map-tab').click();
    await expect(page.locator('.route-card')).toHaveCount(2);
    await page.locator('.route-origin').hover();
    await expect(page.locator('.leaflet-tooltip')).toContainText('<img src=x');
    expect(await page.evaluate(() => !!window.labelInjected)).toBe(false);
    await expect(page.locator('.leaflet-tooltip img')).toHaveCount(0);
});
test('a linked Google plan is patched once after confirmation and survives a failed update', async ({ page }) => {
    await page.route('**/calendar-config.js?*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.JweatherCalendarConfig={googleClientId:"test-public-client"};' }));
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body:
        'window.google={accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:()=>config.callback({access_token:"private-token",expires_in:3600,scope:config.scope})})}}};' }));
    const calls = [];
    let fail = true;
    await page.route('https://www.googleapis.com/calendar/**', route => {
        calls.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
        return route.fulfill({ status: calls.at(-1).method === 'PATCH' && fail ? 503 : 200, json: { id: 'linked-event' } });
    });
    const data = forecast();
    await open(page, data);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await page.waitForFunction(() => !!window.google?.accounts?.oauth2);
    await page.locator('[data-provider=google]').click();
    await expect(page.locator('#calendar-status')).toContainText('Added');
    await page.keyboard.press('Escape');
    const previous = await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans[0].start);
    data.hourly.weather_code[14] = 95;
    await page.getByRole('button', { name: 'Check weather ↻', exact: true }).click();
    await page.getByRole('button', { name: 'Find a better time ↗', exact: true }).click();
    await page.locator('.move-proposal').first().click();
    expect(calls).toHaveLength(1);
    await page.getByRole('button', { name: 'Move plan and calendar', exact: true }).click();
    await expect(page.locator('#move-plan-dialog [role=status]')).toContainText('could not be updated');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jweather.personal.v1')).plans[0].start)).toBe(previous);
    fail = false;
    await page.getByRole('button', { name: 'Move plan and calendar', exact: true }).click();
    await expect(page.locator('#move-plan-dialog [role=status]')).toHaveText('Plan and calendar updated.');
    expect(calls.map(call => call.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    expect(calls.at(-1).url).toMatch(/events\/linked-event$/);
    expect(calls.at(-1).body).not.toHaveProperty('id');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('private-token');
});
test('moving an Outlook plan updates the linked event in UTC instead of creating a duplicate', async ({ page, context }) => {
    await page.route('**/calendar-config.js?*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.JweatherCalendarConfig={microsoftClientId:"test-public-client"};' }));
    await context.route('https://login.microsoftonline.com/**/authorize?*', route => {
        const auth = new URL(route.request().url());
        const callback = new URL(auth.searchParams.get('redirect_uri'));
        callback.search = new URLSearchParams({ state: auth.searchParams.get('state'), code: 'example-code' });
        return route.fulfill({ status: 302, headers: { location: callback.href } });
    });
    await page.route('https://login.microsoftonline.com/**/token', route => route.fulfill({ json: { access_token: 'private-ms-token', token_type: 'Bearer', expires_in: 3600 } }));
    const calls = [];
    await page.route('https://graph.microsoft.com/v1.0/me/events**', route => {
        calls.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
        return route.fulfill({ status: 200, json: { id: 'linked/ms+event' } });
    });
    const data = forecast(); await open(page, data);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await page.locator('[data-provider=microsoft]').click();
    await expect(page.locator('#calendar-status')).toContainText('Added');
    await page.keyboard.press('Escape');
    data.hourly.weather_code[14] = 95;
    await page.getByRole('button', { name: 'Check weather ↻', exact: true }).click();
    await page.getByRole('button', { name: 'Find a better time ↗', exact: true }).click();
    await page.locator('.move-proposal').first().click();
    await page.getByRole('button', { name: 'Move plan and calendar', exact: true }).click();
    await expect(page.locator('#move-plan-dialog [role=status]')).toHaveText('Plan and calendar updated.');
    expect(calls.map(call => call.method)).toEqual(['POST', 'PATCH']);
    expect(calls.at(-1).url).toMatch(/events\/linked%2Fms%2Bevent$/);
    expect(calls.at(-1).body.start.timeZone).toBe('UTC');
    expect(calls.at(-1).body).not.toHaveProperty('transactionId');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('private-ms-token');
});
for (const width of [320, 390, 768, 1440]) {
    test('personal tools, routes, comparison and dialogs fit ' + width + 'px in both themes', async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await maps(page); await open(page);
        for (const theme of ['light', 'dark']) {
            await page.evaluate(value => window.JweatherTheme.setPreference(value), theme);
            await page.locator('[data-edit-profile]').click();
            const dialog = await page.locator('#profile-dialog').boundingBox();
            expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.x + dialog.width).toBeLessThanOrEqual(width);
            await page.keyboard.press('Escape');
            for (const id of ['map-tab', 'compare-tab', 'plans-tab']) {
                await page.locator('#' + id).click();
                if (id === 'map-tab') await expect(page.locator('.route-card')).toHaveCount(2);
                if (id === 'compare-tab') await expect(page.locator('.comparison-card h4')).toBeVisible();
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            }
        }
        expect(await page.locator('.route-line').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
        await page.goto('index.html');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}
