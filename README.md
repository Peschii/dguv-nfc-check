# DGUV NFC Check - freie Android-Web-App

Ziel: Android Chrome scannt NFC-Tags und zeigt nur:

- Grün: gültig
- Rot: prüfen
- Datum
- Labor
- Ort
- Bauteil

## Wichtig

Web NFC funktioniert nicht auf iPhone. Diese Version ist Android Chrome only.

Web NFC benötigt eine sichere Seite:

- `https://...`
- oder `http://localhost`

Ein normaler `http://PC-IP:PORT` Link im WLAN reicht für NFC meist nicht.

## NFC-Tag Inhalt

Empfohlen als Text:

```text
ELEKTRO|EL-001
```

Oder nur:

```text
EL-001
```

Die App extrahiert daraus `EL-001`.

## Freie Betriebsarten

1. Kostenlos über GitHub Pages oder Cloudflare Pages hosten.
2. Lokal auf Android entwickeln mit Chrome und localhost.
3. Später auf einem Raspberry Pi/PC mit HTTPS im WLAN betreiben.

## Daten

Die erste Version speichert Daten im Browser des Geräts (`localStorage`).

Für mehrere Kollegen:

- Daten per `Export JSON` sichern
- Datei per `Import JSON` auf andere Android-Handys einspielen

Später kann daraus eine kleine Server-Version mit SQLite entstehen.

## Morgen-Test

Siehe:

```text
MORGEN_TESTEN.md
```

## Google Sheet

Siehe:

```text
GOOGLE_SHEET_SETUP.md
google-sheet-vorlage.csv
```

