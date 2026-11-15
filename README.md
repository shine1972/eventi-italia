# Eventi Italia — Aggregatore di sagre ed eventi culturali

Sito web statico che raccoglie quotidianamente eventi (sagre, mostre, concerti, feste, eventi culturali) da piu' fonti web e li presenta in un'unica pagina filtrabile.

## Struttura

- `index.html`, `style.css`, `app.js` — frontend statico
- `data/events.json` — dati aggregati (generato dallo scraper)
- `scraper/scrape.py` — scraper Python (Zero, Eventbrite, + fallback demo)
- `.github/workflows/update-events.yml` — aggiornamento giornaliero + deploy GitHub Pages

## Uso locale

1. Installa dipendenze Python:
   ```bash
   pip install -r scraper/requirements.txt
   ```
2. Aggiorna i dati:
   ```bash
   python scraper/scrape.py
   ```
3. Apri `index.html` in un browser (oppure servi la cartella con un server statico).

## Pubblicazione

1. Crea un repository GitHub e fai push del progetto.
2. In *Settings → Pages* abilita "GitHub Actions" come sorgente.
3. Il workflow `update-events` gira ogni giorno alle 05:00 UTC, aggiorna `data/events.json` e pubblica il sito.

## Personalizzazione

- Aggiungi fonti in `scraper/scrape.py` (`SOURCES`).
- Per sagre italiane specifiche, aggiungi URL di pagine con dati strutturati (JSON-LD) o implementa un parser dedicato.
- Filtri e aspetto: `app.js` / `style.css`.

## Note

Lo scraping dipende dalla struttura dei siti sorgente e puo' rompersi nel tempo. Il sito mantiene sempre un set di eventi demo come fallback.
