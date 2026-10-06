#!/usr/bin/env python3
"""Scout free public sources for comparison-vertical topics. Stdlib only, no keys.
Writes data/trends.json. Graceful degradation: a failed source is recorded, old file kept."""
import json, re, time, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = DATA / "trends.json"
UA = {"User-Agent": "compare-building/1.0 (github pages research project)"}

QUERIES = ["best credit cards 2026", "best cash back credit cards", "best brokerage account", "best online broker 2026"]
HN_KEYWORDS = re.compile(r"\b(credit card|cash back|brokerage|broker|investing|index fund|401k|ira|apr|annual fee|points|miles)\b", re.I)
WORD_OK = lambda t: True  # topics are full titles; no substring filtering needed


def get(url, timeout=25):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception as e:
        print(f"  !! fetch failed {url[:60]}: {e}")
        return None


def google_news(query):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=en-US&gl=US&ceid=US:en"
    raw = get(url)
    if not raw:
        return [], f"fetch failed: {query}"
    try:
        root = ET.fromstring(raw)
        items = []
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            pub = (it.findtext("pubDate") or "").strip()
            src = it.find("source")
            source = src.text.strip() if src is not None and src.text else "Google News"
            if title:
                items.append({"title": title, "link": link, "source": source, "published": pub, "query": query})
        return items[:8], None
    except Exception as e:
        return [], f"parse failed: {query}: {e}"


def hackernews():
    raw = get("https://hacker-news.firebaseio.com/v0/topstories.json")
    if not raw:
        return [], "topstories fetch failed"
    try:
        ids = json.loads(raw)[:60]
    except Exception as e:
        return [], f"ids parse failed: {e}"
    hits, err = [], None
    for sid in ids:
        r = get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")
        if not r:
            continue
        try:
            it = json.loads(r)
        except Exception:
            continue
        title = it.get("title") or ""
        if HN_KEYWORDS.search(title):
            hits.append({"title": title, "link": it.get("url") or f"https://news.ycombinator.com/item?id={sid}",
                         "source": "Hacker News", "published": "", "query": "finance filter"})
        if len(hits) >= 6:
            break
        time.sleep(0.15)
    return hits, err


def main():
    topics, errors, seen = [], [], set()
    for q in QUERIES:
        items, err = google_news(q)
        if err:
            errors.append(err)
        for it in items:
            key = it["title"].lower().strip()
            if key not in seen:
                seen.add(key)
                topics.append(it)
        time.sleep(0.4)
    hn, err = hackernews()
    if err:
        errors.append(err)
    for it in hn:
        key = it["title"].lower().strip()
        if key not in seen:
            seen.add(key)
            topics.append(it)
    payload = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": ["Google News RSS", "Hacker News API"],
        "topics": topics,
        "errors": errors,
    }
    if not topics and OUT.exists():
        print("No topics fetched; keeping old file.")
        return
    DATA.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}: {len(topics)} topics, {len(errors)} source errors.")


if __name__ == "__main__":
    main()
