#!/usr/bin/env python3
"""Aggregatore di eventi: scarica eventi da fonti web e produce data/events.json.

Eseguibile manualmente:  python scraper/scrape.py
In produzione viene lanciato dal workflow GitHub Actions ogni giorno.
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

import requests
from lxml import html as lh
from dateutil import parser as dateparser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "events.json")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}

# Fonti da cui aggregare. Ogni voce puo' avere piu' URL (citta'/pagine).
SOURCES = [
    {
        "name": "Zero",
        "kind": "jsonld",
        "urls": [
            "https://www.zero.eu/it/milano/eventi/",
            "https://www.zero.eu/it/roma/eventi/",
            "https://www.zero.eu/it/torino/eventi/",
            "https://www.zero.eu/it/bologna/eventi/",
            "https://www.zero.eu/it/firenze/eventi/",
            "https://www.zero.eu/it/napoli/eventi/",
        ],
    },
    {
        "name": "Eventbrite",
        "kind": "eventbrite",
        "urls": [
            "https://www.eventbrite.it/d/italy--milano/events/",
            "https://www.eventbrite.it/d/italy--roma/events/",
            "https://www.eventbrite.it/d/italy--napoli/events/",
            "https://www.eventbrite.it/d/italy--torino/events/",
            "https://www.eventbrite.it/d/italy--bologna/events/",
            "https://www.eventbrite.it/d/italy--firenze/events/",
            "https://www.eventbrite.it/d/italy/events/?q=sagra",
        ],
    },
]

# Categorie normalizzate
CATEGORY_MAP = {
    "music": "Musica",
    "food_and_drink": "Sagre & Enogastronomia",
    "food": "Sagre & Enogastronomia",
    "arts": "Arte & Cultura",
    "performing_arts": "Arte & Cultura",
    "community": "Comunita' & Tradizioni",
    "culture": "Arte & Cultura",
    "sport": "Sport",
    "business": "Business",
    "charity": "Beneficenza",
    "film and media": "Cinema & Media",
    "film_and_media": "Cinema & Media",
    "film-and-media": "Cinema & Media",
    "health": "Salute & Benessere",
    "hobbies": "Hobby & Tempo libero",
    "hobby": "Hobby & Tempo libero",
    "holiday": "Festivita'",
    "home and lifestyle": "Lifestyle",
    "home_and_lifestyle": "Lifestyle",
    "home-and-lifestyle": "Lifestyle",
    "government": "Istituzioni",
    "fashion": "Moda",
    "other": "Altro",
    "altro": "Altro",
    "charity and causes": "Beneficenza",
    "charity-and-causes": "Beneficenza",
    "science and tech": "Scienza & Tecnologia",
    "science_and_tech": "Scienza & Tecnologia",
    "science-and-tech": "Scienza & Tecnologia",
    "spirituality": "Spiritualita'",
    "travel and outdoor": "Viaggi & Outdoor",
    "travel_and_outdoor": "Viaggi & Outdoor",
    "travel-and-outdoor": "Viaggi & Outdoor",
    "food and drink": "Sagre & Enogastronomia",
}


def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True)
            if r.status_code == 429:
                wait = 2 ** attempt + 1
                print(f"[warn] 429 su {url}, attendo {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.text
        except Exception as e:
            print(f"[warn] fetch failed {url} (tentativo {attempt+1}): {e}", file=sys.stderr)
            time.sleep(1)
    return None


def collect_jsonld_events(obj, out):
    """Estrae ricorsivamente oggetti Event da strutture JSON-LD."""
    if isinstance(obj, list):
        for x in obj:
            collect_jsonld_events(x, out)
        return
    if not isinstance(obj, dict):
        return
    t = obj.get("@type")
    types = t if isinstance(t, list) else [t]
    if "Event" in types:
        out.append(obj)
    # nested (covers ItemList, items, events, etc.)
    for v in obj.values():
        if isinstance(v, (dict, list)):
            collect_jsonld_events(v, out)


def norm_date(v):
    if not v:
        return None
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(v, tz=timezone.utc).isoformat()
        except Exception:
            return None
    s = str(v).strip()
    # ISO already?
    try:
        dt = dateparser.parse(s)
        return dt.isoformat()
    except Exception:
        return s


def clean_text(s):
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def location_from_jsonld(loc):
    if not loc:
        return {"name": "", "address": "", "city": "", "region": ""}
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    if isinstance(loc, str):
        return {"name": loc, "address": "", "city": "", "region": ""}
    name = clean_text(loc.get("name", ""))
    addr = loc.get("address", {}) or {}
    if isinstance(addr, str):
        address = addr
        city = ""
        region = ""
    else:
        street = clean_text(addr.get("streetAddress", ""))
        city = clean_text(addr.get("addressLocality", ""))
        region = clean_text(addr.get("addressRegion", ""))
        postal = clean_text(addr.get("postalCode", ""))
        address = ", ".join(x for x in [street, postal, city] if x)
    return {"name": name, "address": address, "city": city, "region": region}


def parse_jsonld(html_text, source_name, base_url):
    events = []
    try:
        tree = lh.fromstring(html_text)
    except Exception:
        return events
    for script in tree.xpath('//script[@type="application/ld+json"]'):
        raw = (script.text or "").strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            # try to fix trailing commas
            try:
                data = json.loads(re.sub(r",\s*([}\]])", r"\1", raw))
            except Exception:
                continue
        found = []
        collect_jsonld_events(data, found)
        for e in found:
            title = clean_text(e.get("name") or e.get("headline"))
            if not title:
                continue
            start = norm_date(e.get("startDate") or e.get("start_date"))
            end = norm_date(e.get("endDate") or e.get("end_date"))
            loc = location_from_jsonld(e.get("location"))
            loc = normalize_location(loc)
            image = e.get("image")
            if isinstance(image, list):
                image = image[0] if image else ""
            if isinstance(image, dict):
                image = image.get("url", "")
            url = e.get("url") or base_url
            desc = clean_text(e.get("description", ""))
            category = e.get("eventCategory") or e.get("category")
            if not category and source_name == "Zero":
                text = (title + " " + desc).lower()
                if any(k in text for k in ["concert", "musica", "dj", "live", "festival", "techno", "house"]):
                    category = "Musica"
                elif any(k in text for k in ["mostra", "arte", "museum", "museo", "exhibition", "galleria"]):
                    category = "Arte & Cultura"
                else:
                    category = "Eventi & Cultura"
            events.append({
                "id": f"{source_name}-{abs(hash(title + str(start) + loc.get('city','')))}",
                "title": title,
                "description": desc,
                "startDate": start,
                "endDate": end,
                "location": loc,
                "category": normalize_category(category),
                "image": image or "",
                "url": url,
                "source": source_name,
            })
    return events


def normalize_category(c):
    if not c:
        return "Altro"
    if isinstance(c, list):
        c = c[0] if c else ""
    raw = str(c).strip()
    key = raw.lower().replace("_", " ").replace("-", " ")
    key = re.sub(r"\s+", " ", key).strip()
    if key in CATEGORY_MAP:
        return CATEGORY_MAP[key]
    return raw.replace("_", " ").replace("-", " ").title() if len(raw) < 40 else "Altro"


def parse_eventbrite(html_text, source_name, base_url):
    events = []
    try:
        tree = lh.fromstring(html_text)
    except Exception:
        return events
    seen = set()
    # group anchors by data-event-id
    anchors = tree.xpath('//*[@data-event-id]')
    by_id = {}
    for a in anchors:
        eid = a.get("data-event-id")
        if not eid:
            continue
        by_id.setdefault(eid, []).append(a)
    for eid, nodes in by_id.items():
        if eid in seen:
            continue
        seen.add(eid)
        # find a container: walk up to a section/div containing h3
        container = None
        for n in nodes:
            cur = n
            for _ in range(6):
                if cur is None:
                    break
                if cur.xpath('.//h3'):
                    container = cur
                    break
                cur = cur.getparent()
            if container is not None:
                break
        if container is None:
            container = nodes[0]
        # title
        h3s = container.xpath('.//h3')
        title = clean_text(h3s[0].text_content()) if h3s else ""
        if not title:
            continue
        # data attributes
        loc_attr = ""
        cat_attr = ""
        for n in nodes:
            if n.get("data-event-location"):
                loc_attr = n.get("data-event-location")
            if n.get("data-event-category"):
                cat_attr = n.get("data-event-category")
        # url
        url = base_url
        for n in nodes:
            if n.get("href"):
                url = urljoin(base_url, n.get("href"))
                break
        # image
        imgs = container.xpath('.//img')
        image = imgs[0].get("src", "") if imgs else ""
        # paragraphs for date/location
        ps = [clean_text(p.text_content()) for p in container.xpath('.//p')]
        date_text = ""
        venue = ""
        for p in ps:
            try:
                dateparser.parse(p, fuzzy=True)
                if not date_text:
                    date_text = p
                continue
            except Exception:
                pass
            if ("prezzo" in p.lower() or "completo" in p.lower() or "sold out" in p.lower()):
                continue
            if not venue:
                venue = p
        addr_text = venue or (ps[1] if len(ps) > 1 else "")
        city = ""
        region = ""
        if loc_attr:
            parts = [x.strip() for x in loc_attr.split(",")]
            city = parts[0] if parts else ""
            region = parts[1] if len(parts) > 1 else ""
        address = addr_text or loc_attr
        loc = normalize_location({"name": "", "address": address, "city": city, "region": region})
        start = None
        try:
            start = dateparser.parse(date_text, fuzzy=True).isoformat()
        except Exception:
            start = date_text
        events.append({
            "id": f"Eventbrite-{eid}",
            "title": title,
            "description": "",
            "startDate": start,
            "endDate": None,
            "location": loc,
            "category": normalize_category(cat_attr or "community"),
            "image": image,
            "url": url,
            "source": "Eventbrite",
        })
    return events


CITY_REGION = {
    "milano": "Lombardia", "roma": "Lazio", "napoli": "Campania", "torino": "Piemonte",
    "bologna": "Emilia-Romagna", "firenze": "Toscana", "venezia": "Veneto", "padova": "Veneto",
    "verona": "Veneto", "bergamo": "Lombardia", "brescia": "Lombardia", "varese": "Lombardia",
    "genova": "Liguria", "camogli": "Liguria", "lecce": "Puglia", "bari": "Puglia",
    "palermo": "Sicilia", "catania": "Sicilia", "alba": "Piemonte", "arezzo": "Toscana",
    "siena": "Toscana", "borgotaro": "Emilia-Romagna", "borgo val di taro": "Emilia-Romagna",
    "ravenna": "Emilia-Romagna", "florence": "Toscana", "firenze": "Toscana",
    "citta del vaticano": "Lazio", "città del vaticano": "Lazio",
    "alba": "Piemonte", "torino": "Piemonte",
}

PROVINCE_CODES = {"FI","MI","RM","TO","NA","BO","VE","PD","BG","BS","VA","GE","LE","BA","PA","CT","AL","AR","SI","TO"}

def normalize_location(loc):
    if not isinstance(loc, dict):
        return {"name": "", "address": "", "city": "", "region": ""}
    city = re.sub(r"\s+", " ", str(loc.get("city") or "")).strip()
    if city and city.isupper():
        city = city.title()
    region = re.sub(r"\s+", " ", str(loc.get("region") or "")).strip()
    if region and region.isupper() and len(region) > 3:
        region = region.title()
    address = str(loc.get("address") or "").strip()
    name = str(loc.get("name") or "").strip()
    # regione non valida se vuota, uguale alla citta', codice provincia, paese
    if (not region or region == city or region.upper() in PROVINCE_CODES
            or region in ("IT", "Italia", "Italy")):
        region = CITY_REGION.get(city.lower(), region)
    if city.lower() == "online":
        region = "Online"
    if "vaticano" in city.lower():
        region = "Lazio"
    if not region:
        region = ""
    return {"name": name, "address": address, "city": city, "region": region}


def dedup(events):
    seen = set()
    out = []
    for e in events:
        key = (e["title"].lower(), (e.get("startDate") or "")[:10], (e.get("location", {}).get("city") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def demo_events():
    """Eventi di esempio (sagre ed eventi culturali) per garantire contenuto."""
    today = datetime.now().date()
    items = [
        ("Sagra della Castagna", "Tradizionale sagra con caldarroste, dolci e prodotti tipici del territorio.", "Sagre & Enogastronomia", "Borgo Val di Taro", "Emilia-Romagna", 5),
        ("Mostra d'Arte Contemporanea", "Esposizione di artisti emergenti e installazioni interattive.", "Arte & Cultura", "Milano", "Lombardia", 3),
        ("Festival della Musica Popolare", "Tre giorni di concerti, danze e laboratori di musica tradizionale.", "Musica", "Lecce", "Puglia", 10),
        ("Sagra del Tartufo Bianco", "Degustazioni, mercatino e showcooking con chef stellati.", "Sagre & Enogastronomia", "Alba", "Piemonte", 12),
        ("Notte dei Musei", "Apertura straordinaria serale di musei e siti culturali con visite guidate.", "Arte & Cultura", "Roma", "Lazio", 7),
        ("Fiera del Libro Antico", "Mercato di libri rari, manoscritti e stampe d'epoca.", "Arte & Cultura", "Firenze", "Toscana", 14),
        ("Sagra del Pesce", "Frittura di pesce fresco, vino locale e musica dal vivo sul lungomare.", "Sagre & Enogastronomia", "Camogli", "Liguria", 9),
        ("Palio Storico", "Corteo storico, giochi medievali e rievocazione in costume.", "Comunita' & Tradizioni", "Siena", "Toscana", 20),
        ("Concerto Sinfonico", "Orchestra sinfonica in piazza con repertorio classico e colonne sonore.", "Musica", "Verona", "Veneto", 6),
        ("Sagra della Polenta", "Polenta concia, salsicce e formaggi di montagna, animazione per bambini.", "Sagre & Enogastronomia", "Bergamo", "Lombardia", 11),
        ("Mercatino dell'Antiquariato", "Bancarelle di oggetti vintage, modernariato e collezionismo.", "Comunita' & Tradizioni", "Arezzo", "Toscana", 8),
        ("Festival del Cinema Indipendente", "Proiezioni, incontri con registi e workshop di sceneggiatura.", "Arte & Cultura", "Torino", "Piemonte", 15),
        ("Sagra dei Funghi Porcini", "Piatti a base di porcini, escursioni guidate e mostra micologica.", "Sagre & Enogastronomia", "Borgotaro", "Emilia-Romagna", 18),
        ("Mostra Fotografica", "Ritratti e reportage: viaggio visivo attraverso l'Italia rurale.", "Arte & Cultura", "Bologna", "Emilia-Romagna", 4),
        ("Festa Patronale", "Processione, fuochi d'artificio, stand gastronomici e musica popolare.", "Comunita' & Tradizioni", "Napoli", "Campania", 13),
        ("Sagra del Miele", "Degustazioni di mieli monoflorali, laboratori per bambini e artigianato.", "Sagre & Enogastronomia", "Varese", "Lombardia", 16),
        ("Teatro in Piazza", "Spettacolo di commedia dell'arte all'aperto con compagnia locale.", "Arte & Cultura", "Padova", "Veneto", 2),
        ("Sagra della Pizza", "Pizzaioli da tutta Italia, forno a legna e gara della pizza piu' lunga.", "Sagre & Enogastronomia", "Napoli", "Campania", 17),
        ("Giornata dello Sport", "Tornei amatoriali, dimostrazioni e prove gratuite per tutte le eta'.", "Sport", "Bari", "Puglia", 19),
        ("Concerto Jazz", "Quartetto jazz internazionale in auditorium storico.", "Musica", "Palermo", "Sicilia", 21),
    ]
    out = []
    for i, (title, desc, cat, city, region, off) in enumerate(items):
        d = today + timedelta(days=off)
        out.append({
            "id": f"demo-{i}",
            "title": title,
            "description": desc,
            "startDate": datetime(d.year, d.month, d.day, 18, 0).isoformat(),
            "endDate": None,
            "location": normalize_location({"name": "", "address": city, "city": city, "region": region}),
            "category": cat,
            "image": "",
            "url": "#",
            "source": "Demo",
        })
    return out


def main():
    all_events = []
    for src in SOURCES:
        kind = src["kind"]
        for url in src["urls"]:
            html_text = fetch(url)
            if not html_text:
                continue
            if kind == "jsonld":
                evs = parse_jsonld(html_text, src["name"], url)
            elif kind == "eventbrite":
                evs = parse_eventbrite(html_text, src["name"], url)
            else:
                evs = []
            print(f"[info] {src['name']} {url} -> {len(evs)} eventi", file=sys.stderr)
            all_events.extend(evs)
            time.sleep(1.2)

    all_events = dedup(all_events)

    # Fallback demo se lo scraping ha prodotto poco
    if len(all_events) < 15:
        print("[info] aggiungo eventi demo", file=sys.stderr)
        all_events = dedup(all_events + demo_events())

    # Ordina per data
    def sortkey(e):
        s = e.get("startDate") or ""
        return s
    all_events.sort(key=sortkey)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(all_events),
        "events": all_events,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[ok] scritti {len(all_events)} eventi in {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
