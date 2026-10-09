export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
export function button(text, className, action) {
    const node = el('button', className, text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
}
export function externalLink(text, url, className = 'text-link') {
    const link = el('a', className, text);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
}
export function makeDialog(id, title, eyebrow = 'Jweather') {
    const dialog = el('dialog', 'day-dialog journey-dialog');
    dialog.id = id;
    dialog.setAttribute('aria-labelledby', id + '-title');
    const top = el('div', 'dialog-topline');
    const close = button('×', 'dialog-close', () => dialog.close());
    close.setAttribute('aria-label', 'Close ' + title);
    top.append(el('span', 'eyebrow', eyebrow), close);
    const heading = el('h2', '', title);
    heading.id = id + '-title';
    const content = el('div', 'journey-dialog-content');
    dialog.append(top, heading, content);
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
    let opener, returnScope;
    dialog.addEventListener('close', () => {
        const target = opener?.isConnected ? opener : document.querySelector('dialog[open] .dialog-close')
            || (returnScope?.isConnected && [...returnScope.querySelectorAll('button:not(:disabled), a[href], summary')]
                .find(control => control.getClientRects().length));
        target?.focus({ preventScroll: true });
    });
    document.body.append(dialog);
    return { dialog, content, open() { opener = document.activeElement; returnScope = opener?.closest('section, main'); dialog.showModal(); } };
}
export function placeURL(place, extra = {}) {
    const url = new URL('weather.html', window.location.href);
    url.search = new URLSearchParams({ lat: String(place.latitude), lon: String(place.longitude), name: place.name,
        country: place.country || '', region: place.admin1 || '', ...extra });
    return url.href;
}
export function friendlyDate(instant, zone, options = {}) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', ...options }).format(instant);
}
