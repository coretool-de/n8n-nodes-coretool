# n8n-nodes-coretool – deutsche Kurzfassung

Community-Node für [n8n](https://n8n.io), die die **Coretool E-Rechnungs-API** (https://coretool.de) anbindet. Die vollständige Anleitung steht in [README.md](README.md) (Englisch, wie von n8n für verifizierte Nodes verlangt).

## Was die Node kann

| Operation (in n8n) | Bedeutung | Kostet einen Aufruf? |
| --- | --- | --- |
| **Create an E-Invoice** | E-Rechnung erzeugen: ZUGFeRD-PDF oder XRechnung (CII/UBL-XML) aus Rechnungsdaten; Datei kommt als Binärfeld zurück, dazu die berechneten Summen | ja |
| **Validate an E-Invoice** | E-Rechnung prüfen: PDF oder XML (max. 5 MB) mit dem offiziellen KoSIT-Validator prüfen, wahlweise mit vollständigem Bericht | ja |
| **Check a Leitweg-ID** | Leitweg-ID prüfen (Aufbau und Prüfziffer); eine ungültige ID ist ein normales Ergebnis (`valid: false`), kein Fehler | ja (leere Eingabe ist kostenlos) |
| **Get Usage** | Kontingent abfragen: Tarif und verbleibende Aufrufe des Schlüssels | nein |

## Einrichtung

1. Auf https://coretool.de anmelden und unter **API-Schlüssel** einen Schlüssel erzeugen (beginnt mit `ct_live_`).
2. In n8n die Node installieren (**Settings → Community Nodes → Install**, Paketname `n8n-nodes-coretool`).
3. Zugangsdaten **Coretool API** anlegen und den Schlüssel eintragen. Der Verbindungstest kostet keinen Aufruf.

## Beispiel-Workflows

Im Ordner `vorlagen/` liegen drei fertige Workflows zum Importieren (**Workflows → Import from file**): Rechnung per Webhook erzeugen und mailen, Datei prüfen, Leitweg-ID prüfen.

## Fehlermeldungen

Die Node übersetzt die API-Antworten in verständliche Hinweise (Schlüssel ungültig, Kontingent aufgebraucht, Datei zu groß, zu viele Anfragen, Validator kurz nicht erreichbar, fehlende Rechnungsfelder). Mit **Continue On Fail** landen sie im Feld `error` des Ausgabe-Items, statt den Workflow zu stoppen.

## Für Entwickler

`npm ci`, `npm run lint`, `npm run build`; die API-Tests laufen mit `CORETOOL_TEST_KEY=ct_live_... npm test` gegen die echte API (verbraucht Kontingent dieses Schlüssels). Ohne Schlüssel werden sie übersprungen. Veröffentlicht wird nur über GitHub Actions (`publish.yml`, npm Trusted Publishing mit Provenance) per Versions-Tag.

Kontakt: info@coretool.de · Lizenz: MIT
