'use strict';

// Run before the stylesheet so a saved dark preference never flashes a light page.
(() => {
    const key = 'jweather.theme';
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const valid = (value) => ['auto', 'light', 'dark'].includes(value);
    let preference = 'auto';
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (valid(saved)) preference = saved;
    } catch { /* System appearance remains available when storage is blocked. */ }

    function apply() {
        const dark = preference === 'dark' || (preference === 'auto' && system.matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.documentElement.dataset.themePreference = preference;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = dark ? '#1c1d1b' : '#f3f0e9';
        window.dispatchEvent(new CustomEvent('jweather:themechange'));
    }
    window.JweatherTheme = {
        getPreference: () => preference,
        setPreference(value) {
            if (!valid(value)) return;
            preference = value;
            try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The current tab still switches. */ }
            apply();
        }
    };
    system.addEventListener('change', () => { if (preference === 'auto') apply(); });
    window.addEventListener('storage', (event) => {
        if (event.key !== key && event.key !== null) return;
        let saved;
        try { saved = JSON.parse(event.newValue); } catch { saved = null; }
        preference = valid(saved) ? saved : 'auto';
        apply();
    });
    apply();
})();
