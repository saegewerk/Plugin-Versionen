# Plugin-Versionen

Offene Liste der neuesten Versionen von Audio-Plugins. Saege Plugwerk liest sie unter
`https://raw.githubusercontent.com/saegewerk/Plugin-Versionen/main/versions.json`.

- `versions.json`: die Datenbank (`{ format, generated, plugins: [{ vendor, name, aliases?, latest, url, released, source }] }`)
- `sources.json`: woher die Versionen kommen (Typen `html`, `github`, `sparkle`, `json`)
- `tools/crawl-versions.js`: liest alle Quellen; läuft jede Nacht per GitHub Actions (`.github/workflows/versions.yml`)

Fällt eine Seite aus, bleibt der alte Wert. Liefert ein Muster plötzlich eine niedrigere Version, wird sie verworfen.

## Neue Version melden

In Saege Plugwerk auf „Neue Version melden“ klicken. Es öffnet sich ein vorausgefülltes Issue mit dem Label `version-meldung`.
Nach Prüfung das Label `bestätigt` setzen: Der nächste Lauf übernimmt die Version und schließt das Issue.

## Quelle ergänzen

```json
{ "vendor": "Acme", "type": "html", "url": "https://acme.example/versions",
  "products": [ { "name": "Comp", "pattern": "Comp[^0-9]{0,20}(\\d+\\.\\d+(?:\\.\\d+)?)" } ] }
```

Lokal testen: `npm run crawl` und `npm test`.

## Hersteller ohne automatische Quelle

Manche Seiten sperren automatische Abrufe (z. B. KVR Audio, Valhalla DSP) oder nennen keine Versionsnummer.
Für diese Plugins steht der zuletzt bekannte Stand in `versions.json`; neue Versionen kommen über Meldungen aus der App.
Neue Quelle ausprobieren: Workflow „Quelle testen“ starten und die Adresse eintragen. Er zeigt, was die Seite rund um „version“ liefert.

## Betriebssystem-Hinweise (notices.json)

Saege Plugwerk zeigt angekündigte Änderungen an macOS und Windows, die Plugins unbrauchbar machen können, zum Beispiel das Ende von Rosetta 2 mit macOS 28. Der Hinweis erscheint nur, wenn eigene Plugins betroffen sind, und nennt sie.

Jeder Eintrag in `notices.json` hat:
- `id`: eindeutig, ändert sich nie
- `platform`: `darwin` (macOS) oder `win32` (Windows)
- `affects`: `intel` (nur Intel-Code), `32bit` (nur 32 Bit) oder `x64-on-arm` (Windows-PC mit ARM, Plugin ohne ARM64/ARM64EC)
- `severity`: `warn` (rot) oder `info`
- `title`, `text`, optional `date`, `deadline`, `until` (danach ausgeblendet) und `url`

Nach jeder Änderung `updated` auf das heutige Datum setzen.

Jede Nacht durchsucht `tools/check-news.js` die Nachrichten von Apple und Microsoft (`news-sources.json`) nach Stichwörtern wie Rosetta, 32 Bit oder ARM64. Neue Treffer werden Issues mit dem Label `os-news`. Nichts wird automatisch übernommen: Wer das Issue prüft, ergänzt bei Bedarf `notices.json` und schließt es.

## Produktbilder

`images.json` listet die Produktseite jedes Plugins beim Hersteller. Der nächtliche Lauf holt daraus das Vorschaubild (`og:image`) und trägt in `versions.json` nur den Link ein (`image`, dazu `page`). Die Bilder selbst liegen nicht in diesem Repo, sie bleiben beim Hersteller. Neue Plugins: Eintrag mit `vendor`, `name` (wie in `versions.json`) und `page` ergänzen.

## Subwerk Audio

Eigene Produkte melden ihre Version selbst: Jeder Homepage-Upload legt `<produkt-id>-version.json` neben die Downloads in `https://subwerk-audio.com/files/` (Inhalt z. B. `{"product":"plugwerk","name":"Plugwerk","vendor":"Subwerk Audio","version":"1.0.10","date":"2026-11-24"}`). Für jedes Produkt steht in `sources.json` ein Eintrag vom Typ `json` mit dieser Adresse und `"path": "version"`. Plugins heißen dort wie in der DAW: `SW <Name>`.
