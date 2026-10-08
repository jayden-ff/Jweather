import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixture } from './fixtures.mjs';
const path = 'weather.html?lat=52.52&lon=13.405&name=Berlin&country=Germany';
function forecast() {
    const data = structuredClone(fixture);
    const keys = Object.keys(data.hourly).filter(k => k !== 'time');
    data.hourly.time = Array.from({ length: 72 }, (_, i) => '2026-10-' + String(8 + Math.floor(i / 24)).padStart(2, '0') + 'T' + String(i % 24).padStart(2, '0') + ':00');
    keys.forEach(key => { data.hourly[key] = Array(72).fill(data.hourly[key][0]); });
    return data;
}
async function open(page, data = forecast()) {
    await page.clock.install({ time: new Date('2026-10-08T12:15:00Z') });
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: data }));
    await page.goto(path);
    await expect(page.locator('#weather-content')).toBeVisible();
}
async function config(page, value) {
    await page.route('**/calendar-config.js?*', route => route.fulfill({ contentType: 'text/javascript',
        body: 'window.JweatherCalendarConfig = ' + JSON.stringify(value) + ';' }));
}
test('activity suggestions explain the selected moment and offer usable alternatives', async ({ page }) => {
    await open(page);
    await expect(page.locator('.moment-title')).toHaveText('A good time for a walk.');
    await expect(page.locator('.moment-time')).toHaveText('14:30–15:30');
    await expect(page.locator('.moment-reasons')).toContainText('Rain up to 15%');
    await expect(page.locator('.moment-reasons')).toContainText('Wind up to 12 km/h');
    await expect(page.locator('.moment-alternative')).toHaveCount(3);
    await page.locator('.moment-alternative').nth(1).click();
    await expect(page.locator('.moment-time')).toHaveText('16:00–17:00');
    await expect(page.locator('.moment-alternative').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.moment-alternative').nth(1)).toBeFocused();
    await page.getByRole('button', { name: 'Sunset', exact: true }).click();
    await page.locator('#outside-day').selectOption('today');
    await expect(page.locator('.moment-time')).toHaveText('17:45–18:30');
    await expect(page.locator('#duration-field')).toBeHidden();
});
test('personal choices persist and units change without requesting another forecast', async ({ page }) => {
    let requests = 0;
    await page.clock.install({ time: new Date('2026-10-08T12:15:00Z') });
    await page.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast() }); });
    await page.goto(path);
    await page.getByRole('button', { name: 'Cycle', exact: true }).click();
    await page.locator('#outside-preferences summary').click();
    await page.locator('#outside-duration').selectOption('90');
    await page.locator('#outside-period').selectOption('morning');
    await expect(page.locator('.moment-badge')).toContainText('90 minutes');
    await expect(page.locator('.moment-badge')).toContainText('Tomorrow');
    await page.getByRole('button', { name: '°F', exact: true }).click();
    await expect(page.locator('.moment-reasons')).toContainText('57°F');
    expect(requests).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Cycle', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#outside-duration')).toHaveValue('90');
    await expect(page.locator('#outside-period')).toHaveValue('morning');
    await page.getByRole('button', { name: 'Sunset', exact: true }).click();
    await expect(page.locator('.moment-title')).toHaveText('Catch the last light.');
    await expect(page.locator('#period-field')).toBeHidden();
});
test('storms and missing readings produce honest empty states with no calendar action', async ({ page }) => {
    const data = forecast();
    data.hourly.weather_code.fill(95);
    await open(page, data);
    await expect(page.locator('.moment-title')).toHaveText('No comfortable window yet.');
    await expect(page.getByRole('button', { name: 'Add to calendar', exact: true })).toHaveCount(0);
    delete data.hourly.wind_gusts_10m;
    await page.reload();
    await expect(page.locator('.moment-title')).toHaveText('A little more data needed.');
    await expect(page.locator('#temperature')).toHaveText('14°');
});
test('planning still works without local storage, and respects reduced motion', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await open(page);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('.moment-title')).toHaveText('Room for a run.');
    expect(await page.locator('.moment-orb').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.locator('.activity-pill').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(await page.locator('#moment-copy').evaluate(el => el.getAnimations().length)).toBe(0);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await expect(page.locator('#calendar-dialog')).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) {
    test('recommendations and calendar chooser fit ' + width + 'px in both appearances', async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await open(page);
        for (const theme of ['light', 'dark']) {
            await page.evaluate(value => window.JweatherTheme.setPreference(value), theme);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const bounds = await page.locator('.moment-time').boundingBox();
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
            const dialog = await page.locator('#calendar-dialog').boundingBox();
            expect(dialog.x).toBeGreaterThanOrEqual(0);
            expect(dialog.x + dialog.width).toBeLessThanOrEqual(width);
            await expect(page.getByRole('link', { name: /Google Calendar/ })).toBeVisible();
            await page.getByRole('button', { name: 'Close calendar' }).click();
            await expect(page.getByRole('button', { name: 'Add to calendar', exact: true })).toBeFocused();
        }
    });
}
test('calendar drafts use the chosen window and escaped place, without any OAuth requests', async ({ page }) => {
    const external = [];
    page.on('request', request => { if (/accounts\.google|microsoftonline|graph\.microsoft|googleapis/.test(request.url())) external.push(request.url()); });
    await open(page);
    await page.getByRole('button', { name: 'Sunset', exact: true }).click();
    await page.locator('#outside-day').selectOption('today');
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    const google = new URL(await page.getByRole('link', { name: /Google Calendar/ }).getAttribute('href'));
    const outlook = new URL(await page.getByRole('link', { name: /Outlook/ }).getAttribute('href'));
    expect(google.searchParams.get('dates')).toBe('20261008T154500Z/20261008T163000Z');
    expect(google.searchParams.get('text')).toContain('sunset · Berlin');
    expect(outlook.searchParams.get('startdt')).toBe('2026-10-08T15:45:00.000Z');
    expect(await page.getByRole('link', { name: /Microsoft 365/ }).getAttribute('href')).toContain('outlook.office.com');
    await page.keyboard.press('Escape');
    await expect(page.locator('#calendar-dialog')).toBeHidden();
    expect(external).toEqual([]);
});
test('downloaded ICS has the selected event and honest import instructions', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-ics]').click()]);
    const contents = await readFile(await download.path(), 'utf8');
    expect(download.suggestedFilename()).toBe('jweather-walk-2026-10-08.ics');
    expect(contents).toContain('DTSTART:20261008T123000Z\r\n');
    expect(contents).toContain('DTEND:20261008T133000Z\r\n');
    expect(contents).toContain('BEGIN:VEVENT');
    await expect(page.locator('#calendar-status')).toContainText('Open it to import');
});
test('configured Google connects only on click, inserts once and keeps tokens out of storage', async ({ page }) => {
    await config(page, { googleClientId: 'test-public-client' });
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body:
        "window.google={accounts:{oauth2:{initTokenClient: function(config){return {requestAccessToken: function(){config.callback({access_token:'test-token',expires_in:3600,scope:config.scope})}}}}}};" }));
    let inserted;
    let calls = 0;
    await page.route('https://www.googleapis.com/calendar/v3/calendars/primary/events', route => {
        calls++;
        inserted = route.request().postDataJSON();
        expect(route.request().headers().authorization).toBe('Bearer test-token');
        return route.fulfill({ status: 201, json: { id: inserted.id, htmlLink: 'https://calendar.google.com/calendar/event?eid=example' } });
    });
    await open(page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await expect(page.getByRole('link', { name: /Google Calendar link/ })).toBeVisible();
    expect(calls).toBe(0);
    await page.waitForFunction(() => !!window.google?.accounts?.oauth2);
    await page.locator('[data-provider="google"]').click();
    await expect(page.locator('#calendar-status')).toContainText('Added to your calendar');
    expect(inserted.start).toEqual({ dateTime: '2026-10-08T12:30:00.000Z', timeZone: 'Europe/Berlin' });
    expect(inserted.end.dateTime).toBe('2026-10-08T13:30:00.000Z');
    expect(inserted.summary).toContain('walk · Berlin');
    expect(inserted.id).toMatch(/^[0-9a-f]{64}$/);
    await page.locator('[data-provider="google"]').click();
    expect(calls).toBe(1);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain('test-token');
    await page.locator('#calendar-disconnect').click();
    await expect(page.locator('#calendar-status')).toContainText('Disconnected here');
});
test('denied Google consent and failed insert never pretend the event was added', async ({ page }) => {
    await config(page, { googleClientId: 'test-client' });
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body:
        "window.google={accounts:{oauth2:{initTokenClient: function(config){return {requestAccessToken: function(){config.callback({error:'access_denied'})}}}}}};" }));
    await open(page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await page.waitForFunction(() => !!window.google?.accounts?.oauth2);
    await page.locator('[data-provider="google"]').click();
    await expect(page.locator('#calendar-status')).toContainText('not granted');
    await expect(page.locator('[data-provider="google"]')).toBeEnabled();
    await page.evaluate(() => { window.google.accounts.oauth2.initTokenClient = config => ({ requestAccessToken: () => config.callback({ access_token: 'test', scope: config.scope, expires_in: 3600 }) }); });
    await page.route('https://www.googleapis.com/calendar/**', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.locator('[data-provider="google"]').click();
    await expect(page.locator('#calendar-status')).toContainText('could not be added');
    await expect(page.locator('.calendar-confirmation')).toHaveCount(0);
});
test('Outlook uses a real PKCE exchange, validates state and writes UTC event times', async ({ page, context }) => {
    await config(page, { microsoftClientId: 'test-microsoft-client', microsoftTenant: 'common' });
    let authorization;
    let exchanged;
    let inserted;
    await context.route('https://login.microsoftonline.com/**/authorize?*', route => {
        authorization = new URL(route.request().url());
        const callback = new URL(authorization.searchParams.get('redirect_uri'));
        callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'test-authorization-code' });
        return route.fulfill({ status: 302, headers: { location: callback.href } });
    });
    await page.route('https://login.microsoftonline.com/**/token', route => {
        exchanged = new URLSearchParams(route.request().postData());
        return route.fulfill({ json: { token_type: 'Bearer', access_token: 'test-ms-token', expires_in: 3600 } });
    });
    await page.route('https://graph.microsoft.com/v1.0/me/events', route => {
        inserted = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { id: 'example-event', webLink: 'https://outlook.live.com/calendar/item/example' } });
    });
    await open(page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await page.locator('[data-provider="microsoft"]').click();
    await expect(page.locator('#calendar-status')).toContainText('Added to your calendar');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('scope')).toBe('https://graph.microsoft.com/Calendars.ReadWrite');
    expect(exchanged.get('code')).toBe('test-authorization-code');
    expect(exchanged.get('client_secret')).toBeNull();
    expect(createHash('sha256').update(exchanged.get('code_verifier')).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));
    expect(exchanged.get('redirect_uri')).toBe('http://127.0.0.1:8080/Jweather/calendar-callback.html');
    expect(inserted.start).toEqual({ dateTime: '2026-10-08T12:30:00.000', timeZone: 'UTC' });
    expect(inserted.transactionId).toMatch(/^[0-9a-f]{64}$/);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('test-ms-token');
});
test('blocked Outlook popup leaves calendar links and ICS available', async ({ page }) => {
    await config(page, { microsoftClientId: 'test-client' });
    await page.addInitScript(() => { window.open = () => null; });
    await open(page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    await page.locator('[data-provider="microsoft"]').click();
    await expect(page.locator('#calendar-status')).toContainText('blocked');
    await expect(page.getByRole('link', { name: /Outlook calendar link/ })).toBeVisible();
    await expect(page.locator('[data-ics]')).toBeEnabled();
});
test('Outlook ignores a callback with the wrong state before completing a valid sign-in', async ({ page, context }) => {
    await config(page, { microsoftClientId: 'test-client' });
    await context.route('https://login.microsoftonline.com/**/authorize?*', route => route.fulfill({ contentType: 'text/html', body: '<p>Example sign-in</p>' }));
    let exchangedCode;
    await page.route('https://login.microsoftonline.com/**/token', route => {
        exchangedCode = new URLSearchParams(route.request().postData()).get('code');
        return route.fulfill({ json: { token_type: 'Bearer', access_token: 'test', expires_in: 3600 } });
    });
    await page.route('https://graph.microsoft.com/v1.0/me/events', route => route.fulfill({ status: 201, json: { id: 'test-event' } }));
    await open(page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-provider="microsoft"]').click()]);
    await popup.waitForURL('https://login.microsoftonline.com/**');
    const auth = new URL(popup.url());
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ state: 'wrong-state', code: 'invalid-code' });
    // A provider redirects its popup; an address-bar/CDP navigation clears window.opener.
    await popup.evaluate(url => window.location.replace(url), callback.href);
    await popup.waitForURL('**/calendar-callback.html');
    await popup.waitForFunction(() => !window.location.search);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    expect(exchangedCode).toBeUndefined();
    await expect(page.locator('.calendar-confirmation')).toHaveCount(0);
    callback.search = new URLSearchParams({ state: auth.searchParams.get('state'), code: 'correct-code' });
    await popup.evaluate(url => window.location.replace(url), callback.href);
    await expect(page.locator('#calendar-status')).toContainText('Added to your calendar');
    expect(exchangedCode).toBe('correct-code');
});
