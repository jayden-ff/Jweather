import { el, button, makeDialog, placeURL, friendlyDate } from './ui.js?v=20261009.1';
import { getState, removePlan, restorePlan, savePlan, updatePlan, linkCalendar, hasPersistentStorage, placeKey } from './personal-store.js?v=20261009.1';
import { showFeedback } from './feedback.js?v=20261009.1';
import { fetchForecast } from './forecast-api.js?v=20261009.1';
import { activities, checkPlan, findWindows, clockTime, localParts } from './activity-engine.js?v=20261009.1';
import { sharePlan, sharedPlanURL, readSharedPlan } from './share-plan.js?v=20261009.1';
import { configuration, updateDirect, makeEvent, prepareGoogle } from './calendar.js?v=20261009.1';
let sequence = 0;
let expanded = false;
let movement;
let shared;
function when(plan) {
    return friendlyDate(plan.start, plan.zone) + ' · ' + clockTime(plan.start, plan.zone) + '–' + clockTime(plan.end, plan.zone);
}
export function initPlans() {
    if (!document.getElementById('saved-plans')) return;
    window.addEventListener('jweather:personal', () => renderPlans());
    window.addEventListener('online', () => renderPlans(true));
    renderPlans();
}
export async function renderPlans(fresh = false) {
    const container = document.getElementById('saved-plans');
    if (!container) return;
    const token = ++sequence;
    const plans = getState().plans.filter(p => p.end > Date.now() - 86400000).sort((a, b) => a.start - b.start);
    const active = plans.filter(p => p.end > Date.now());
    for (const id of ['plans-count', 'home-plans-count']) {
        const count = document.getElementById(id); if (count) count.textContent = active.length ? String(active.length) : '';
    }
    const home = document.getElementById('home-plans'); if (home) home.hidden = !plans.length;
    container.replaceChildren();
    if (!plans.length) {
        container.append(el('div', 'plans-empty', 'A good moment is worth keeping. Save an activity above and we will check its weather when you return.'));
        return;
    }
    const toolbar = el('div', 'plans-toolbar');
    const check = button(fresh ? 'Checking weather …' : 'Check weather ↻', 'quiet-button check-plans', async () => {
        const focused = document.activeElement === check;
        await renderPlans(true);
        if (focused && document.activeElement === document.body) container.querySelector('.check-plans')?.focus({ preventScroll: true });
    });
    check.disabled = fresh;
    toolbar.append(el('p', 'journey-note', 'Checked when you open Jweather. Your plans stay in this browser.'),
        check);
    container.append(toolbar);
    const shown = expanded ? plans : plans.slice(0, 4);
    const cards = [];
    shown.forEach(plan => {
        const card = el('article', 'plan-card'); card.dataset.planId = plan.id;
        const text = el('div', 'plan-copy');
        text.append(el('p', 'eyebrow', activities[plan.activity].label + ' · ' + plan.place.name),
            el('h3', '', when(plan)));
        const status = el('p', 'plan-status', plan.end <= Date.now() ? 'This moment has passed.' : 'Checking the forecast …');
        status.setAttribute('role', 'status');
        const actions = el('div', 'plan-actions');
        actions.append(button('Share', 'quiet-button', async () => {
            status.textContent = await sharePlan(plan, url => showShareLink(url));
        }));
        const view = el('a', 'quiet-button', 'Forecast ↗'); view.href = sharedPlanURL(plan); actions.append(view);
        actions.append(button('Remove', 'quiet-button', event => {
            const focus = document.activeElement === event.currentTarget;
            removePlan(plan.id);
            showFeedback('Plan removed.', { actionLabel: 'Undo', action: () => restorePlan(plan), focus });
        }));
        text.append(status, actions);
        card.append(text); container.append(card); cards.push({ plan, card, status, actions });
    });
    if (plans.length > 4) container.append(button(expanded ? 'Show fewer plans' : 'Show all ' + plans.length + ' plans', 'quiet-button', () => { expanded = !expanded; renderPlans(); }));
    // Fetch each place once; a shared cache reuses the visible forecast.
    const forecasts = new Map();
    await Promise.all(cards.map(async ({ plan, card, status, actions }) => {
        if (plan.end <= Date.now()) { card.dataset.fit = 'past'; return; }
        let data;
        let assessment;
        try {
            const key = placeKey(plan.place);
            if (!forecasts.has(key)) forecasts.set(key, fetchForecast(plan.place, fresh));
            data = await forecasts.get(key); assessment = checkPlan(data, plan);
        }
        catch { assessment = { status: 'unavailable', message: 'The forecast could not load. Your plan is still saved.' }; }
        if (token !== sequence) return;
        card.dataset.fit = assessment.status;
        status.textContent = assessment.message;
        if (assessment.window) {
            const window = assessment.window;
            status.textContent += ' Rain up to ' + Math.round(window.rain) + '% · Wind up to ' + Math.round(window.wind) + ' km/h.';
        }
        if (assessment.status === 'changed' && data) actions.prepend(button('Find a better time ↗', 'plan-reschedule', () => suggestMove(plan, data)));
        else if (assessment.status === 'good') {
            actions.prepend(button(plan.calendar ? 'Calendar ↗' : 'Add this plan to calendar', 'quiet-button', () => {
                if (document.getElementById('calendar-dialog')) window.dispatchEvent(new CustomEvent('jweather:open-calendar', {
                    detail: { window: assessment.window, place: plan.place, planId: plan.id, calendar: plan.calendar }
                }));
                else window.location.assign(placeURL(plan.place, { activity: plan.activity, planAt: new Date(plan.start).toISOString(), minutes: String(plan.duration), calendar: '1' }));
            }));
        }
    }));
    if (token === sequence) { check.disabled = false; check.textContent = 'Check weather ↻'; }
}
function showShareLink(url) {
    const view = makeDialog('share-dialog', 'A plan to share.', 'Time together');
    const input = el('input', 'journey-input'); input.value = url; input.readOnly = true; input.setAttribute('aria-label', 'Plan link');
    view.content.append(el('p', 'journey-note', 'This link shares the activity, place and time. Your calendar connection stays private.'), input);
    view.open(); input.select();
    view.dialog.addEventListener('close', () => view.dialog.remove(), { once: true });
}
async function suggestMove(plan, data) {
    if (!movement) movement = makeDialog('move-plan-dialog', 'A better moment.', 'Your plan');
    const profile = getState().profile;
    const options = { activity: plan.activity, duration: plan.duration, horizonHours: 144 };
    if (profile.enabled) Object.assign(options, { earliest: profile.from, latest: profile.to, weekdays: profile.weekdays });
    let result = findWindows(data, { ...options, dates: [localParts(plan.start, plan.zone).slice(0, 10)] });
    if (!result.windows.length) result = findWindows(data, options);
    movement.content.replaceChildren(el('p', 'journey-note', 'Current plan: ' + when(plan) + '. Choose a new moment to review the change.'));
    const message = el('p', 'journey-status'); message.setAttribute('role', 'status');
    if (!result.windows.length) movement.content.append(el('p', 'journey-note', 'No suitable alternative is available yet. Your plan stays as it is.'));
    result.windows.forEach(window => {
        const proposal = button('', 'move-proposal', () => confirmMove(plan, window));
        proposal.append(el('strong', '', when(window)), el('span', '', 'Rain up to ' + Math.round(window.rain) + '% · Wind up to ' + Math.round(window.wind) + ' km/h'));
        movement.content.append(proposal);
    });
    movement.content.append(message); movement.open();
}
function confirmMove(plan, window) {
    const direct = plan.calendar && configuration(plan.calendar.provider);
    const message = el('p', 'journey-status'); message.setAttribute('role', 'status');
    const confirm = button(direct ? 'Move plan and calendar' : 'Move saved plan', 'solid-button', async () => {
        confirm.disabled = true;
        try {
            if (direct) {
                const event = makeEvent(window, plan.place, 'Rescheduled to a better forecast window.', sharedPlanURL({ ...plan, ...window }));
                const saved = await updateDirect(plan.calendar.provider, event, plan.calendar);
                updatePlan(plan.id, window); linkCalendar(plan.id, plan.calendar.provider, saved.id);
            } else updatePlan(plan.id, window);
            message.textContent = direct ? 'Plan and calendar updated.' : plan.calendar ? 'Saved plan moved. The existing calendar entry has not changed.' : 'Your plan has moved.';
            confirm.textContent = 'Moved ✓';
        } catch (error) { message.textContent = error.message; confirm.disabled = false; }
    });
    movement.content.replaceChildren(el('p', 'journey-note', plan.place.name), el('p', 'move-before', 'From ' + when(plan)),
        el('h3', 'move-after', 'To ' + when(window)),
        el('p', 'journey-note', direct ? 'This updates the saved plan and its linked calendar event after you connect.'
            : plan.calendar ? 'This moves your saved plan. Update your existing calendar entry separately.' : 'Only this saved plan will change.'), confirm, message);
    confirm.focus({ preventScroll: true });
    if (direct && plan.calendar.provider === 'google') prepareGoogle().catch(error => { message.textContent = error.message; });
}
export function renderSharedPlan(context) {
    const container = document.getElementById('shared-plan');
    if (!container || shared) return;
    const plan = readSharedPlan(new URLSearchParams(window.location.search), context.place, context.weather.timezone);
    if (!plan) return;
    shared = plan;
    const assessment = checkPlan(context.weather, plan);
    const card = el('article', 'shared-plan-card');
    const status = el('p', 'journey-status', assessment.message); status.setAttribute('role', 'status');
    card.append(el('p', 'eyebrow', 'An invitation outside'), el('h3', '', activities[plan.activity].label + ' · ' + when(plan)), status);
    if (plan.end > Date.now()) {
        const save = button('Save this plan', 'solid-button', () => {
            try {
                const saved = savePlan(plan, plan.place);
                status.textContent = hasPersistentStorage() ? 'Saved to your plans.' : 'Saved for this visit.';
                save.textContent = 'Saved ✓'; save.disabled = true;
                if (new URLSearchParams(window.location.search).get('calendar') === '1' && assessment.window) {
                    window.dispatchEvent(new CustomEvent('jweather:open-calendar', { detail: { window: assessment.window, place: plan.place, planId: saved.id } }));
                }
            } catch (error) { status.textContent = error.message; }
        });
        card.append(save);
    }
    container.replaceChildren(card);
    document.querySelector('[data-workspace="plans"]')?.click();
}
