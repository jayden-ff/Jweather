'use strict';
(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('state');
    const code = params.get('code');
    const error = params.get('error');
    history.replaceState(null, '', window.location.pathname);
    if (window.opener && state) {
        window.opener.postMessage({ type: 'jweather:calendar-auth', state, code, error }, window.location.origin);
    } else {
        document.getElementById('callback-message').textContent = 'Return to Jweather and choose your calendar again.';
    }
})();
