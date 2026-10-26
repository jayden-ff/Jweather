# JWeather: eigene große Kartenansicht

Status: Designvorschlag zur Freigabe; noch keine Implementierung.

## Ziel und bestätigte Richtung
Der Nutzer möchte die Routenfunktion mit Wetterinformationen aus der Präsentation weiterverfolgen und hat eine eigene große Kartenansicht gewählt. Die Karte soll zur Planung einer Aktivität dienen: Route, Wetter entlang der Strecke und Abfahrtszeit in einem Arbeitsbereich. Bestehende Prognosen, persönliche Pläne und Kalender bleiben erreichbar.

Visuelle Referenz: /workspace/outputs/jweather/JWeather-Kartenkonzept.pdf. Die Referenz enthält schematische Kartografie und Beispieldaten, keine echte berechnete Route.

## Ansätze
1. Bestehenden Explore-Bereich im Wetterverlauf vergrößern: wenig Navigationsänderung, weiterhin begrenzter Raum.
2. Eigene große Kartenansicht: Platz für Karte, Routenauswahl und Abfahrtsvergleich. Vom Nutzer gewählt.
3. Reine Vollbildkarte mit allen Bedienelementen darüber: maximiert die Fläche, erschwert das Lesen mehrerer Routen. Deshalb nicht empfohlen.

## Vorgeschlagener erster Umfang
- Eigene verlinkbare Explore-Seite, direkt aus „Find a route“ und der bisherigen Explore-Navigation erreichbar; Ort, Aktivität und gewähltes Zeitfenster werden übernommen. Rückweg zur Wetteransicht bleibt sichtbar.
- Desktop: große Karte im verfügbaren Fenster, Routenauswahl links, Abfahrtszeiten unten. Farben und Typografie folgen JWeather. Aktive Route klar hervorgehoben; Alternativen zurückhaltender.
- Mobil: Karte als Hauptfläche, Routendetails in einem aufklappbaren unteren Panel. Panel hat sichtbaren Schalter; Ziehen ist optional. Karteninteraktion ist direkt möglich, weil diese Seite keine lange Wetteransicht mehr enthält.
- Gehen, Laufen und Rad bleiben verfügbar. Start und Ziel sind veränderbar. Bestehende echte OSRM-Routen, Richtungslinks und GPX-Export bleiben nutzbar. Zunächst ausdrücklich Hin-und-zurück-Routen wie im vorhandenen Dienst; echte Rundkurse benötigen zusätzliche Routingarbeit und sind später möglich. Die Schleife im Mockup ist eine schematische Darstellung.
- Neu: Wetter an wenigen repräsentativen Punkten entlang einer Route zur geschätzten Passagezeit. Temperatur, Regenwahrscheinlichkeit und Wind werden sichtbar, inklusive nachvollziehbarer Textbewertung. Prognoseauflösung und geschätzte Reisezeit bleiben erkennbar. Keine straßengenaue Wettergarantie.
- Auswahl mehrerer Abfahrtszeiten am gewählten Tag aktualisiert Wetterpunkte und Zusammenfassung. Empfehlung nur unter den tatsächlich bewerteten Zeiten und Routen; bei fehlenden Daten keine behauptete beste Route.
- Vorhandenes Speichern des Wetterfensters bleibt erhalten und wird so beschriftet. Dauer der gesamten Route muss ins Fenster passen; Speichern darf nicht bloß einen passenden Start prüfen. Das dauerhafte Speichern der vollständigen Routengeometrie ist nicht Teil der ersten Version; die „Route speichern“-Beschriftung im visuellen Entwurf wird entsprechend präzisiert.

## Technische Leitplanken und bewusste Festlegungen
Diese Punkte sind Vorschläge des Assistenten, keine separat bestätigten Nutzervorgaben:
- Bestehende statische Web-App und Leaflet verwenden; kein Frameworkwechsel, kein Nutzerkonto, kein neuer Backenddienst.
- Kartendetails beruhigen durch eigene Bedienelemente, reduzierte Overlays, klare Route und eine geeignete Grundkartendarstellung. Kein ungeprüfter Wechsel auf einen externen Kartenanbieter: zunächst bestehende OSM-Kacheln, Attribution erhalten. Kartendaten bleiben geografisch korrekt; der schematische Mockup-Stil wird nicht als erfundene echte Karte umgesetzt.
- Open-Meteo für Streckenpunkte nutzen, räumlich doppelte Punkte wiederverwenden, begrenzte Abfragen und Zwischenspeicherung; nicht beim Ziehen eines Reglers fortlaufend neue Anfragen erzeugen. Maximal fünf räumliche Wetterpunkte pro aktiver Route; Alternativen erst bei Auswahl nachladen. Nutzungslimits und Lizenzbedingungen bleiben zu beachten.
- Passagezeiten anhand kumulierter Streckendistanz und bestehender geschätzter Routendauer; nächster stündlicher Prognosewert ohne erfundene Minutengenauigkeit. Die Uhrzeit des Punktes und die zeitliche Auflösung werden unterschieden. Relevante bestehende Komfort- und Gefahrenkriterien wiederverwenden, keine neue statistische Prognosesicherheit erfinden.
- Ortszeit, Tageswechsel und Sommerzeit explizit berücksichtigen. Startzeiten außerhalb des geladenen Prognosehorizonts deaktivieren.
- Keine Wind-/Regenflächen oder Radaranimationen vortäuschen: Layer-Schalter steuern in dieser Version nur die Darstellung der vorhandenen Streckenpunktdaten. Windrichtungen nur anzeigen, wenn die Datenquelle sie liefert; gegebenenfalls Stundenparameter ergänzen.
- Wetterpunkte dienen als lokale Bewertung einer Route. Sie dürfen einen unabhängig gespeicherten Stadtwetterplan nicht ungeprüft als sicher ausweisen.
- Offline oder bei API-Fehlern klare Zustände, bestehende Pläne bleiben zugänglich. Fehlt Streckenwetter, Route mit Hinweis nutzbar, Empfehlung und Speichern eines neuen bewerteten Fensters deaktiviert.
- Bestehende Oberflächensprache Englisch beibehalten; die Präsentation ist deutsch. Eine allgemeine Übersetzung ist ein separates Vorhaben.
- Neue statische Ressourcen in PWA-Cache aufnehmen, Versionierung sauber aktualisieren. Keine Offline-Kacheldownloads.

## Erfolg und Grenzen
Erfolg: Ein Nutzer findet aus einem gewählten Wetterfenster eine echte Route, versteht Bedingungen zu Passagezeiten, vergleicht Abfahrten und kann die Route öffnen oder exportieren. Auf Mobilgeräten bleiben Karte, Zeitwahl und Routendetails bedienbar. Verschlechterung und fehlende Daten sind sichtbar. Bestehende Wetter-, Plan-, Kalender- und Offline-Funktionen funktionieren weiterhin.

Nicht Teil dieser Version: Navigation während der Fahrt, Push-Warnungen, echte Rundkursgenerierung, Regenradar, Schattenrouting, Gruppenplanung, vollständige dauerhafte Routenbibliothek oder Veröffentlichung einer neuen Live-Version.

## Dem Implementierer überlassen
Dateiaufteilung, genaue responsive Breakpoints, Bedienung als diskrete Zeitbuttons oder zugänglicher Slider, genaue Markerzahl unter dem Maximum, CSS-Details, Abfragebündelung und passende gezielte Unit-/UI-Tests. Keine freie Änderung des oben genannten Funktionsumfangs.
