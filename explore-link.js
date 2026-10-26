// Carry an outdoor moment between the weather page and the dedicated map.
export function exploreURL(context) {
    const url = new URL('explore.html', window.location.href);
    const place = context.place;
    const moment = context.window;
    url.search = new URLSearchParams({ lat: String(place.latitude), lon: String(place.longitude), name: place.name,
        country: place.country || '', activity: moment?.activity || context.activity || 'walk',
        minutes: String(moment?.duration || context.duration || 60) });
    if (Number.isFinite(moment?.start)) url.searchParams.set('at', new Date(moment.start).toISOString());
    return url.href;
}
