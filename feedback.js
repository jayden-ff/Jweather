import { el, button } from './ui.js?v=20261009.1';

let current;
export function showFeedback(message, { actionLabel, action, focus = false } = {}) {
    current?.close();
    const toast = el('div', 'feedback-toast');
    const status = el('p', 'feedback-message', message);
    status.setAttribute('role', 'status');
    const actions = el('div', 'feedback-actions');
    let timer;
    const close = () => {
        clearTimeout(timer);
        const focused = toast.contains(document.activeElement);
        toast.remove();
        if (current?.toast === toast) current = null;
        if (focused) document.querySelector('[data-workspace="plans"][aria-selected="true"], #home-plans summary')?.focus({ preventScroll: true });
    };
    const dismiss = button('×', 'feedback-dismiss', close);
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    let undo;
    if (actionLabel && action) {
        undo = button(actionLabel, 'quiet-button', () => {
            try { action(); close(); }
            catch (error) { status.textContent = error.message; }
        });
        actions.append(undo);
    }
    actions.append(dismiss);
    toast.append(status, actions);
    document.body.append(toast);
    current = { toast, close };
    const schedule = () => {
        clearTimeout(timer);
        if (!toast.contains(document.activeElement)) timer = setTimeout(close, 10000);
    };
    toast.addEventListener('pointerenter', () => clearTimeout(timer));
    toast.addEventListener('pointerleave', schedule);
    toast.addEventListener('focusin', () => clearTimeout(timer));
    toast.addEventListener('focusout', () => queueMicrotask(schedule));
    if (focus) (undo || dismiss).focus({ preventScroll: true });
    schedule();
}
