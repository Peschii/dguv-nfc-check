# Morgen testen mit echten NFC-Tags

## 1. Tags nicht sperren

Beim Schreiben in NFC Tools oder in der Web-App keine Option wie `Lock`, `Read only`, `Permanent sperren` verwenden.

## 2. Testinhalt

Für maximale Kompatibilitaet schreiben wir URLs auf die Tags:

```text
https://DEINE-APP-URL/?id=EL-001
```

Nicht final:

```text
ELEKTRO|EL-001
```

Text geht nur für Android-Web-NFC. URL geht auch für iPhone.

## 3. Android-Test

1. App auf Android Chrome per HTTPS öffnen.
2. `Testdaten` drücken.
3. `EL-001` anzeigen.
4. `NFC-Tag mit URL beschreiben` drücken.
5. Leeren Tag ans Handy halten.
6. Danach Tag erneut scannen.
7. Erwartung: App öffnet `EL-001` und zeigt `GÜLTIG`.

## 4. Zweiter Test

1. `EL-002` anzeigen.
2. Neuen Tag mit URL beschreiben.
3. Tag scannen.
4. Erwartung: `PRÜFEN` rot.

## 5. Wenn NFC-Schreiben nicht geht

Nutze Android-App `NFC Tools`:

1. Schreiben.
2. Datensatz hinzufuegen.
3. URL/URI.
4. App-URL mit `?id=EL-001` eintragen.
5. Schreiben.


