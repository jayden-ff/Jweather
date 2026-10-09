import { el, button, makeDialog } from './ui.js?v=20261009.1';
import { forecastURL } from './forecast-api.js?v=20261009.1';

// Keep dialogs inside the visible area when a phone's keyboard opens.
function syncViewport() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--available-height', (viewport?.height || innerHeight) + 'px');
    document.documentElement.style.setProperty('--viewport-top', (viewport?.offsetTop || 0) + 'px');
}
syncViewport();
window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', syncViewport, { passive: true });
window.addEventListener('resize', syncViewport, { passive: true });

let installPrompt, installer;
const controls = [...document.querySelectorAll('[data-install-app]')];
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function syncInstall() { controls.forEach(control => { control.hidden = standalone(); }); }
syncInstall();
matchMedia('(display-mode: standalone)').addEventListener('change', syncInstall);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installPrompt = null; installer?.dialog.close(); syncInstall(); });
controls.forEach(control => control.addEventListener('click', async () => {
    if (installPrompt) {
        const prompt = installPrompt; installPrompt = null;
        await prompt.prompt(); await prompt.userChoice; return;
    }
    installer ||= makeDialog('install-dialog', 'A place on your home screen.', 'Get the app');
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || /Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1;
    const steps = el('ol', 'install-steps');
    const instructions = apple ? ['Open this page in Safari.', 'Tap Share, then Add to Home Screen.', 'Keep your forecast and plans a tap away.']
        : ['Open your browser’s menu.', 'Choose Install app or Add to Home screen, when available.', 'Open Jweather from your home screen or app list.'];
    instructions.forEach(step => steps.append(el('li', '', step)));
    installer.content.replaceChildren(el('p', 'journey-note', 'No account needed. Places and plans stay in this browser. Last loaded forecasts are available offline once the app has been saved.'), steps);
    installer.open();
}));
function showFreshness(context) {
    const notice = document.getElementById('forecast-notice');
    if (!notice) return;
    const metadata = context.weather._jweather;
    notice.hidden = !metadata?.cached;
    document.getElementById('current-title').textContent = metadata?.cached ? 'Saved conditions' : 'Right now';
    if (!metadata?.cached) return;
    let saved = 'earlier';
    if (Number.isFinite(Date.parse(metadata.savedAt))) saved = new Intl.DateTimeFormat('en-GB', { timeZone: context.weather.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(metadata.savedAt));
    notice.replaceChildren(el('span', '', 'Saved forecast · ' + saved + ' local time. Reconnect to check current conditions and plan new activities. '),
        button('Try again ↻', 'quiet-button', () => window.dispatchEvent(new Event('jweather:refresh'))));
}
window.addEventListener('jweather:forecast', event => showFreshness(event.detail));
if (window.JweatherForecast) showFreshness(window.JweatherForecast);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    let registration;
    const ready = navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' }).then(async value => {
        registration = value;
        const active = await navigator.serviceWorker.ready;
        return active;
    }).catch(() => null);
    const cacheForecast = async (data, url) => {
        if (!data || data._jweather?.cached) return;
        const active = await ready;
        active?.active?.postMessage({ type: 'CACHE_FORECAST', url, data, savedAt: data._jweather?.savedAt || new Date().toISOString() });
    };
    window.addEventListener('jweather:cache-forecast', event => cacheForecast(event.detail.data, event.detail.url));
    window.addEventListener('jweather:forecast', event => cacheForecast(event.detail.weather, forecastURL(event.detail.place)));
    if (window.JweatherForecast) cacheForecast(window.JweatherForecast.weather, forecastURL(window.JweatherForecast.place));
    let reloadOnUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadOnUpdate) location.reload(); });
    function offerUpdate() {
        if (!registration?.waiting || !navigator.serviceWorker.controller || document.getElementById('app-update')) return;
        const notice = el('div', 'app-update'); notice.id = 'app-update'; notice.setAttribute('role', 'status');
        notice.append(el('span', '', 'A fresh version is ready.'), button('Update Jweather ↻', 'quiet-button', () => {
            reloadOnUpdate = true; registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }));
        document.querySelector('.site-footer')?.before(notice);
    }
    ready.then(value => {
        if (!value) return;
        offerUpdate();
        value.addEventListener('updatefound', () => value.installing?.addEventListener('statechange', offerUpdate));
    });
}
