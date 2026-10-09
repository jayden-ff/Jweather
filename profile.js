import { el, button, makeDialog } from './ui.js?v=20261008.5';
import { activities } from './activity-engine.js?v=20261008.5';
import { getState, setProfile, toggleFavorite, hasPersistentStorage } from './personal-store.js?v=20261008.5';
import { pickPlace } from './place-picker.js?v=20261008.5';
let editor;
export function editProfile() {
    if (!editor) editor = makeDialog('profile-dialog', 'Your kind of day.', 'My day');
    const state = getState();
    const form = el('form', 'profile-form');
    const activity = selectField('Preferred activity', 'profile-activity', Object.entries(activities).map(([key, value]) => [key, value.label]), state.profile.activity);
    const duration = selectField('Time to spare', 'profile-duration', [['30', '30 minutes'], ['60', '1 hour'], ['90', '90 minutes']], String(state.profile.duration));
    const fields = el('div', 'profile-fields');
    fields.append(activity.label, duration.label);
    const presetLabel = el('label', 'journey-field', 'When are you usually free?');
    const preset = el('select', 'journey-select');
    preset.id = 'profile-preset';
    for (const [value, text] of [['custom', 'Your own hours'], ['any', 'Anytime'], ['morning', 'Morning'], ['lunch', 'Lunch break'], ['evening', 'After work']]) {
        const option = el('option', '', text); option.value = value; preset.append(option);
    }
    presetLabel.append(preset);
    const timeFields = el('div', 'profile-fields');
    const from = timeField('From', 'profile-from', state.profile.from);
    const to = timeField('Until', 'profile-to', state.profile.to);
    timeFields.append(from.label, to.label);
    preset.addEventListener('change', () => {
        const times = { any: ['06:00', '23:59'], morning: ['06:00', '12:00'], lunch: ['12:00', '14:00'], evening: ['17:00', '21:00'] }[preset.value];
        if (times) { from.input.value = times[0]; to.input.value = times[1]; }
    });
    const days = el('fieldset', 'profile-days');
    days.append(el('legend', '', 'On these days'));
    const checks = [];
    for (const [index, text] of [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']]) {
        const label = el('label');
        const input = el('input'); input.type = 'checkbox'; input.value = String(index); input.checked = state.profile.weekdays.includes(index);
        label.append(input, el('span', '', text)); days.append(label); checks.push(input);
    }
    const places = el('div', 'profile-places');
    const drawPlaces = () => {
        const current = getState();
        places.replaceChildren(el('p', 'journey-label', 'Your places'));
        current.favorites.forEach(place => {
            const chip = button(place.name + ' ×', 'place-chip', () => { toggleFavorite(place); drawPlaces(); });
            chip.setAttribute('aria-label', 'Remove ' + place.name + ' from favorites');
            places.append(chip);
        });
        if (current.favorites.length < 4) places.append(button('+ Add a place', 'place-chip', () => pickPlace(place => { toggleFavorite(place); drawPlaces(); })));
    };
    drawPlaces();
    const message = el('p', 'journey-status'); message.setAttribute('role', 'status');
    const submit = el('button', 'solid-button', 'Save my day'); submit.type = 'submit';
    const note = el('p', 'journey-note', 'These preferences and your places stay in your browser.');
    form.append(fields, presetLabel, timeFields, days, places, note, message, submit);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const weekdays = checks.filter(c => c.checked).map(c => Number(c.value));
        if (!weekdays.length) { message.textContent = 'Choose at least one day.'; return; }
        if (from.input.value >= to.input.value) { message.textContent = 'Choose an end time after the start time.'; return; }
        setProfile({ activity: activity.select.value, duration: Number(duration.select.value),
            from: from.input.value, to: to.input.value, weekdays, enabled: true });
        if (!hasPersistentStorage()) message.textContent = 'Saved for this visit. Browser storage is unavailable.';
        else editor.dialog.close();
    });
    editor.content.replaceChildren(form);
    editor.open();
}
function selectField(text, id, options, value) {
    const label = el('label', 'journey-field', text);
    const select = el('select', 'journey-select'); select.id = id;
    for (const [key, text] of options) { const option = el('option', '', text); option.value = key; select.append(option); }
    select.value = value; label.append(select); return { label, select };
}
function timeField(text, id, value) {
    const label = el('label', 'journey-field', text);
    const input = el('input', 'journey-input'); input.type = 'time'; input.id = id; input.value = value; input.required = true;
    label.append(input); return { label, input };
}
