# Compare Building

An automated comparison engine for **high-payout affiliate verticals** — credit cards and online brokerages (US).

## The concept: why high-payout verticals change the math

A typical Amazon-style affiliate commission is ~4% of a sale — you need enormous volume to matter.
Credit-card affiliate programs pay roughly **$50–200 per approved application** (2026 affiliate program roundups:
Capital One ~$50–200, Discover up to ~$150, Amex ~$50+). Brokerage programs pay similarly per funded account.

At a $75 average payout, the math needs ~13x fewer conversions than a 4% commission on a $45 order.
Traffic is still the hard part — but the funnel is far more forgiving. The Simulation Lab on the site
shows this transparently with adjustable assumptions.

## The building

Four floors, each a department with clickable agents:

- **F1 Scouts** — daily trend intelligence (Google News RSS + Hacker News finance filter)
- **F2 Data** — fact tables built only from high-confidence public facts; anything uncertain is omitted or marked `unverified`
- **F3 Compare** — interactive comparison tables with tag filters + a "best for X" quiz (cash back vs travel vs no annual fee)
- **F4 Monetize** — affiliate slots (one ID activates links site-wide, `rel="sponsored"`) + the Simulation Lab

Tap any floor or agent to see its task, what it receives, what it sends, and why.

## Data sources & verification policy

- **Topics**: Google News RSS (public), Hacker News public API (finance-keyword filtered). Refreshed daily by the workflow.
- **Product facts**: compiled from long-stable public knowledge (issuer/brokerage sites, widely reported terms), last verified **2026-10-06**.
  Card terms and brokerage features change — every product carries a "verify on the issuer's site" note, and any field we're not sure about is marked `unverified`, never guessed.
- **Affiliate payout ranges**: $50–200 per approved card application per 2026 affiliate-program roundups (Impact, FlexOffers networks). The site's $75 default assumption sits inside that range.

## How it runs

- **GitHub Pages** serves the static site (mobile-first, no build step).
- **`.github/workflows/daily.yml`** runs every morning at 06:00 UTC: `scout.py` → `brief.py` → commits `data/trends.json` + `data/briefs.json` if changed. Manual trigger included.

## Honest notes

- Traffic takes months to compound; the Simulation Lab's default projection (~$4,350 fake over 12 months) is a guess-driven illustration, not a promise.
- Affiliate programs require the **owner** to sign up and get approved (identity required) — then one sub-ID activates every link.
- Educational content only — not financial advice. Terms change; verify everything on the issuer's official site.
- The site never places wagers and never moves money.
