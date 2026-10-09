import { el, button, makeDialog } from './ui.js?v=20261009.1';
import { searchPlaces } from './forecast-api.js?v=20261009.1';
import { getState } from './personal-store.js?v=20261009.1';
let picker;
let select;
let abort;
let timer;
export function pickPlace(onSelect) {
    select = onSelect;
    if (!picker) {
        picker = makeDialog('place-picker', 'Find your place.', 'A little change of scenery');
        const input = el('input', 'journey-input');
        input.type = 'search';
        input.placeholder = 'Search a city or place';
        input.setAttribute('aria-label', 'Find a place');
        input.autocomplete = 'off';
        input.autocapitalize = 'off'; input.spellcheck = false; input.enterKeyHint = 'search';
        input.maxLength = 100;
        const status = el('p', 'journey-status');
        status.setAttribute('role', 'status');
        const list = el('div', 'picker-results');
        const favorites = el('div', 'picker-favorites');
        picker.content.append(input, status, list, favorites);
        picker.input = input; picker.status = status; picker.list = list; picker.favorites = favorites;
        input.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
            const options = [...(input.value.trim() ? list : favorites).querySelectorAll('.picker-result')];
            if (!options.length) return;
            event.preventDefault();
            const item = event.key === 'ArrowUp' ? options.at(-1) : options[0];
            if (event.key === 'Enter') item.click(); else item.focus();
        });
        const move = event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const options = [...(input.value.trim() ? list : favorites).querySelectorAll('.picker-result')];
            const index = options.indexOf(document.activeElement);
            if (index < 0) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options[next]?.focus();
        };
        list.addEventListener('keydown', move); favorites.addEventListener('keydown', move);
        input.addEventListener('input', () => {
            clearTimeout(timer); abort?.abort(); list.replaceChildren(); status.textContent = '';
            if (input.value.trim().length < 2) return;
            timer = setTimeout(async () => {
                const query = input.value.trim();
                abort = new AbortController();
                const current = abort;
                status.textContent = 'Finding your place …';
                try {
                    const results = await searchPlaces(query, current.signal);
                    if (current.signal.aborted || input.value.trim() !== query) return;
                    list.replaceChildren();
                    results.forEach(place => list.append(placeButton(place)));
                    status.textContent = results.length ? 'Choose a place below.' : 'No places found. Try another name.';
                } catch (error) { if (!current.signal.aborted) status.textContent = 'Place search could not load. Try again.'; }
            }, 280);
        });
        picker.dialog.addEventListener('close', () => { clearTimeout(timer); abort?.abort(); });
    }
    picker.input.value = ''; picker.list.replaceChildren(); picker.status.textContent = '';
    const favorites = getState().favorites;
    picker.favorites.replaceChildren();
    if (favorites.length) {
        picker.favorites.append(el('p', 'eyebrow', 'Your places'));
        favorites.forEach(place => picker.favorites.append(placeButton(place)));
    }
    picker.open();
    picker.input.focus();
}
function placeButton(place) {
    const item = button('', 'picker-result', () => {
        const callback = select;
        picker.dialog.close();
        callback(place);
    });
    item.append(el('strong', '', place.name), el('span', '', [place.admin1, place.country].filter(Boolean).join(', ')));
    return item;
}
