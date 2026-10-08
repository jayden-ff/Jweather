# Jweather

Ein schlichtes Wetterjournal in Beige, Schwarz und warmen Grautönen. Statisches HTML, CSS und JavaScript, ohne Framework, API-Schlüssel oder Build-Schritt.

## Funktionen

- Ortssuche mit Vorschlägen, regionaler Zuordnung und Tastaturbedienung
- Standortabfrage auf ausdrücklichen Klick
- Aktuelles Wetter mit gefühlter Temperatur, Luftfeuchtigkeit und Wind
- Sonnenaufgang, Sonnenuntergang und Regenwahrscheinlichkeit
- Die nächsten acht Stunden und fünf Tage mit Tagesdetails
- Umschaltbare Celsius-/Fahrenheit-Anzeige und zuletzt angesehene Orte
- Helle und dunkle Darstellung; „Automatisch“ folgt der Systemeinstellung, die manuelle Wahl bleibt beim Seitenwechsel erhalten
- Wetterabhängige Farbstimmung und ruhige Effekte für Sonne, Wolken, Regen, Schnee, Nebel, Gewitter und klare Nächte
- Suchvorschläge über der Illustration, mit platzabhängiger Öffnung nach oben oder unten
- Mobile Ansicht, native Dialoge, sichtbarer Tastaturfokus und reduzierte Animationen bei `prefers-reduced-motion`
- Verständliche Lade-, Fehler- und Wiederholungszustände

Die Schriftarten **DM Sans** und **Instrument Serif** werden lokal ausgeliefert. Ihre SIL-OFL-Lizenzen liegen in `assets/fonts/`. Es werden keine Google-Fonts-Anfragen gestellt. Der Browser ruft nur die öffentlichen Open-Meteo-Dienste für Ortssuche und Wetter ab. Ein Standort wird erst nach Klick und Browserfreigabe verwendet; zuletzt angesehene Orte, die gewählte Einheit und die Darstellung werden nur lokal gespeichert.

Über das Darstellungssymbol oben rechts lässt sich zwischen **Automatisch**, **Hell** und **Dunkel** wechseln. Die Wetterlage verändert die Farbstimmung unabhängig davon; Nachtwerte zeigen passende Symbole und bei klarem Himmel Sterne. `theme.js` lädt die gespeicherte Darstellung vor dem Stylesheet. Die Effekte bleiben auf den aktuellen Wetterbereich begrenzt und respektieren `prefers-reduced-motion`.

## Lokal starten

Ein einfacher statischer Webserver reicht:

```sh
python3 -m http.server 8000
```

Öffne anschließend die Startseite auf Port 8000. Für die Standortabfrage ist außerhalb von localhost HTTPS erforderlich.

Alternativ mit Node.js 20 oder neuer:

```sh
npm run dev
```

Dieser Entwicklungsserver liefert die Seite auf Port 8080 unter `/Jweather/` aus. Er benötigt keine npm-Installation. Der Projektpfad entspricht einer typischen GitHub-Pages-Adresse.

## GitHub Pages

In den Repository-Einstellungen unter **Pages → Build and deployment**:

1. **Deploy from a branch** wählen.
2. Den gewünschten Branch und **/ (root)** auswählen.
3. Speichern.

Es gibt nichts zu kompilieren. `index.html` ist die Startseite; Stylesheets, Skripte, Schriften, Favicon und Navigation verwenden relative Pfade. Die Seite funktioniert sowohl auf einer eigenen Domain als auch unter einem Projektpfad wie `https://jayden-ff.github.io/Jweather/`. `.nojekyll` ermöglicht die direkte Auslieferung der statischen Dateien.

Wetterseiten sind direkt verlinkbar:

```text
weather.html?lat=52.52&lon=13.405&name=Berlin&country=Deutschland
```

Bestehende Links mit `lat`, `lon` und `name` funktionieren weiter. Ungültige oder fehlende Koordinaten führen zu einer verständlichen Meldung mit Link zur Ortssuche.

## Browserprüfungen

Die einzigen npm-Abhängigkeiten sind Entwicklungswerkzeuge für die Tests:

```sh
npm ci
npx playwright install chromium
npm test
```

Mit einem bereits installierten Chromium lässt sich der Download vermeiden:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm test
```

Die Tests starten ihren statischen Server selbst. Sie prüfen den kompletten Such- und Wetterablauf, Desktop- und Mobilansichten (320–1440 px), Projektpfade, Einheitenwechsel, Dialoge, Netzwerkfehler, ungültige Daten, verspätete Suchantworten, Standortfreigaben und deaktivierten lokalen Speicher. Außerdem prüfen sie die Systemdarstellung, gespeicherte Theme-Wahl, Synchronisierung zwischen Tabs, Wettereffekte, reduzierte Animationen und die tatsächliche Klickbarkeit der Suchvorschläge über der Illustration. Die API-Antworten sind für wiederholbare Tests kontrolliert; die Tests benötigen keinen Zugang zu Open-Meteo.

## Daten und Grenzen

Vorhersagen und Ortsdaten stammen von [Open-Meteo](https://open-meteo.com/). Die Anwendung verwendet aktuelle Werte aus `current`, stündliche Werte ab der aktuellen Stunde und Tageswerte in der Zeitzone des gewählten Orts. Die Regenwahrscheinlichkeit im Tagesüberblick ist der Tageshöchstwert. Fehlende optionale Messwerte erscheinen als `—`. Die Ortszeit wird laufend aktualisiert; neue Wetterdaten werden beim Aufrufen oder Neuladen der Seite angefordert.

Die kostenlosen Open-Meteo-Endpunkte unterliegen den [Nutzungsbedingungen](https://open-meteo.com/en/terms) des Anbieters. Bei fehlender Verbindung oder einer Anbieterbegrenzung bleibt die Seite bedienbar und bietet einen erneuten Versuch.

## Lizenz

Apache 2.0, siehe [LICENSE](LICENSE). Die Schriftlizenzen liegen separat unter `assets/fonts/`.
