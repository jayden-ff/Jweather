# Calendar connections

Calendar links and ICS export work immediately. They prepare the recommended activity's title, location, forecast context and exact start/end times. Google, Outlook and Microsoft 365 links open a draft that the user saves; Apple Calendar and other apps import the downloaded file.

For direct event creation, configure one or both providers below. Jweather remains a static GitHub Pages site. Public application IDs identify the app; they are not passwords. **Never add a client secret, access token or refresh token to the repository.**

## Google Calendar

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable **Google Calendar API**.
2. Configure Google Auth Platform branding, audience and data access. The requested scope is `https://www.googleapis.com/auth/calendar.events.owned`: create events in calendars owned by the user. The app writes to the primary calendar.
3. Create an OAuth client of type **Web application**.
4. Add the authorized JavaScript origin **`https://jayden-ff.github.io`**. Origins do not contain the `/Jweather/` path. For local development, register the local server's origin separately.
5. Put the public client ID in `googleClientId` in [calendar-config.js](../calendar-config.js).

Jweather loads Google Identity Services when the calendar chooser opens. A user clicks **Google Calendar**, selects an account and grants access. The browser then creates the selected event. Access tokens stay in memory; no server exchange or redirect callback is used for Google.

An external app in testing needs its users added as test users. A public release may need Google's OAuth verification. Configure the audience for the accounts you intend to support.

## Outlook and Microsoft 365

1. Register an application in [Microsoft Entra](https://entra.microsoft.com/).
2. Choose supported account types that include the accounts you want to use. The default `common` authority supports personal Microsoft and work/school accounts when the registration permits both.
3. Add a **Single-page application (SPA)** platform with the exact redirect URI:

   `https://jayden-ff.github.io/Jweather/calendar-callback.html`

4. Add the Microsoft Graph **delegated** permission `Calendars.ReadWrite`. This creates the chosen event in the signed-in user's default calendar. Do not use application permissions.
5. Put the public application/client ID in `microsoftClientId` in [calendar-config.js](../calendar-config.js). Change `microsoftTenant` only if the app should use a specific tenant.

Jweather uses the authorization-code flow with PKCE in a popup. The callback checks the originating popup, origin and a random state; the token exchange includes the one-time verifier. No client secret or refresh token is used. Work/school organizations may require an administrator's consent according to their policy.

For local development, register the matching SPA redirect URI, for example `http://127.0.0.1:8080/Jweather/calendar-callback.html`. The origin, port and project path must match the actual server.

## Behaviour and limits

- Direct creation starts only when the user chooses that provider for a selected activity. Consent is requested when needed; subsequent additions reuse the in-memory session until it expires.
- Reloading forgets the connection. **Disconnect calendars here** clears this page's sessions. Existing events remain; revoke the app's consent in the provider's account settings if needed.
- Events carry UTC instants. Google also receives the location's IANA timezone; ICS exports UTC. Local times in missing or ambiguous daylight-saving hours are skipped rather than guessed.
- Stable Google event IDs and Microsoft transaction IDs protect against duplicate events when the same activity is retried. Exported files use a stable UID, although import behaviour varies between calendar apps.
- Calendar links and ICS remain available when a sign-in popup is blocked, access is denied or direct creation fails. The app reports success only after the provider confirms an event.
- This static site adds an activity while it is open. It does not monitor an account, check schedule conflicts, automatically move an existing event when the forecast changes or run background scheduling.
- Provider flows are verified in browser tests with simulated responses. Complete a real account check after configuring each registration: grant consent, add an activity, verify the time in the calendar, then test denial/disconnection.
