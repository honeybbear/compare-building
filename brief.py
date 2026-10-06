#!/usr/bin/env python3
"""Build content briefs from scouted material. Stdlib only, no LLM key needed.
Writes data/briefs.json: headline options, outline, key points, source links."""
import json, re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
TRENDS = DATA / "trends.json"
OUT = DATA / "briefs.json"

STOP = set("the a an and or of to in on for with best top vs versus 2026 2025 new how what why".split())


def keywords(title):
    words = re.findall(r"[a-z]{4,}", title.lower())
    return [w for w in words if w not in STOP]


def main():
    if not TRENDS.exists():
        print("No trends file; skipping briefs.")
        return
    trends = json.loads(TRENDS.read_text(encoding="utf-8"))
    topics = trends.get("topics", [])
    briefs = []
    for t in topics[:6]:
        title = t["title"]
        kws = keywords(title)[:4]
        angle = ", ".join(kws) if kws else "comparison basics"
        briefs.append({
            "headline_options": [
                f"{title} — what the fine print actually says",
                f"Honest guide: {angle}",
                f"{title}: our no-hype breakdown",
            ],
            "outline": [
                "Who this is for (one paragraph)",
                "The key numbers that matter",
                "Where the catch is (fees, gotchas)",
                "Who should skip it",
                "Verdict + verify-on-issuer-site reminder",
            ],
            "key_points": [
                f"Angle: {angle}",
                "Use only verified public facts; mark anything uncertain as unverified",
                "Include affiliate disclosure wherever a link could earn a commission",
            ],
            "sources": [{"title": t["title"], "link": t.get("link", ""), "source": t.get("source", "")}],
        })
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "briefs": briefs,
        "_note": "Briefs are starting points from real scouted topics. A human (or the daily operator) turns them into full guides.",
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}: {len(briefs)} briefs.")


if __name__ == "__main__":
    main()
