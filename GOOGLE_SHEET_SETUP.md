# Google Sheet als Datenquelle

## Spalten

Das Sheet braucht diese Spalten in Zeile 1:

```text
Tag_ID
Bauteil
NächstePrüfung
Labor
Ort
```

Datum am besten so:

```text
2026-12-31
```

oder:

```text
31.12.2026
```

## Veröffentlichen

In Google Sheets:

1. `Datei`
2. `Freigeben`
3. `Im Web veröffentlichen`
4. Blatt auswaehlen
5. Format: `CSV`
6. Link kopieren

Den CSV-Link in der App bei `Google-Sheet-CSV-URL` einfuegen und `Merken` drücken.

## Hinweise

- Jeder, der den Link hat, kann die veröffentlichten Daten lesen.
- Keine vertraulichen Daten ins Sheet schreiben.
- Für unser Tool reichen Tag-ID, Bauteil, Datum, Labor und Ort.

