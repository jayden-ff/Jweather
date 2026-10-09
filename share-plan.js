import { activities } from './activity-engine.js?v=20261008.5';
import { placeURL } from './ui.js?v=20261008.5';
export function sharedPlanURL(plan) {
    return placeURL(plan.place, { activity: plan.activity, planAt: new Date(plan.start).toISOString(), minutes: String(plan.duration) });
}
export function readSharedPlan(params, place, zone) {
    const activity = params.get('activity');
    const duration = Number(params.get('minutes'));
    const value = params.get('planAt');
    if (!Object.hasOwn(activities, activity) || ![30, 45, 60, 90].includes(duration)
        || (activity === 'sunset' ? duration !== 45 : duration === 45) || typeof value !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return null;
    const start = Date.parse(value);
    if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 19) !== value.slice(0, 19)
        || !Number.isFinite(new Date(start + duration * 60000).getTime())) return null;
    return { id: 'shared', activity, duration, start, end: start + duration * 60000, place, zone };
}
export async function sharePlan(plan, fallback) {
    const url = sharedPlanURL(plan);
    if (navigator.share) {
        try {
            await navigator.share({ title: activities[plan.activity].label + ' in ' + plan.place.name, text: 'A little time outside.', url });
            return 'Shared.';
        } catch (error) { if (error.name === 'AbortError') return ''; }
    }
    if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(url); return 'Plan link copied.'; } catch { /* Show a selectable link. */ }
    }
    if (fallback) fallback(url);
    return 'Your plan link is ready.';
}
