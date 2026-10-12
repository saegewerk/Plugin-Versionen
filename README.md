# Plugin-Versionen

Offene Liste der neuesten Versionen von Audio-Plugins. Plugin Organizer liest sie unter
`https://raw.githubusercontent.com/saegewerk/Plugin-Versionen/main/versions.json`.

- `versions.json`: die Datenbank (`{ format, generated, plugins: [{ vendor, name, aliases?, latest, url, released, source }] }`)
- `sources.json`: woher die Versionen kommen (Typen `html`, `github`, `sparkle`, `json`)
- `tools/crawl-versions.js`: liest alle Quellen; läuft jede Nacht per GitHub Actions (`.github/workflows/versions.yml`)

Fällt eine Seite aus, bleibt der alte Wert. Liefert ein Muster plötzlich eine niedrigere Version, wird sie verworfen.

## Neue Version melden

In Plugin Organizer auf „Neue Version melden“ klicken. Es öffnet sich ein vorausgefülltes Issue mit dem Label `version-meldung`.
Nach Prüfung das Label `bestätigt` setzen: Der nächste Lauf übernimmt die Version und schließt das Issue.

## Quelle ergänzen

```json
{ "vendor": "Acme", "type": "html", "url": "https://acme.example/versions",
  "products": [ { "name": "Comp", "pattern": "Comp[^0-9]{0,20}(\\d+\\.\\d+(?:\\.\\d+)?)" } ] }
```

Lokal testen: `npm run crawl` und `npm test`.
