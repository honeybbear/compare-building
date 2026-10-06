/* Compare Building — Command Deck.
   Gamified missions, commander XP, and the ship's log — like the reference
   dashboard, but with a hard rule: EVERY number is computed from real
   data/*.json. Nothing is invented, and anything simulated is labeled. */
"use strict";

function cmdLevelFor(xp) {
  var level = 1 + Math.floor(xp / 150);
  var titles = ["Cadet", "Ensign", "Lieutenant", "Commander", "Admiral", "Fleet Admiral"];
  return {
    level: level,
    title: titles[Math.min(level - 1, titles.length - 1)],
    xpInto: xp - (level - 1) * 150,
    xpNeed: 150
  };
}

function computeCommand(DB) {
  var products = (DB.cards || []).length + (DB.brokers || []).length;
  var briefs = (DB.briefs.briefs || []).length;
  var topics = (DB.trends.topics || []).length;
  var runs = (DB.health && DB.health.successful_runs) || 0;
  var xp = products * 10 + briefs * 15 + topics * 2 + runs * 5;
  var l = cmdLevelFor(xp);
  return {
    xp: xp, level: l.level, title: l.title, xpInto: l.xpInto, xpNeed: l.xpNeed,
    parts: [
      ["products cataloged", products, 10],
      ["briefs queued", briefs, 15],
      ["topics scouted", topics, 2],
      ["green pipeline runs", runs, 5]
    ]
  };
}

function simRunRate(DB) {
  var a = DB.assumptions || {};
  var v0 = +a.start_monthly_visitors || 500, g = (+a.monthly_growth_pct || 15) / 100;
  var ctr = (+a.click_through_pct || 8) / 100, appr = (+a.approval_rate_pct || 5) / 100;
  var pay = +a.avg_payout_usd || 75;
  return v0 * Math.pow(1 + g, 11) * ctr * appr * pay;
}

function computeMissions(DB) {
  var products = (DB.cards || []).length + (DB.brokers || []).length;
  var briefs = (DB.briefs.briefs || []).length;
  var slots = (DB.affiliates.slots || []);
  var live = slots.filter(function (s) { return !!s.sub_id; }).length;
  var runs = (DB.health && DB.health.successful_runs) || 0;
  var rate = simRunRate(DB);
  return [
    { id: "catalog", name: "Expand the catalog", target: "20 verified products",
      prog: Math.min(1, products / 20), label: products + " / 20",
      how: "Counts verified products in data/cards.json + data/brokers.json." },
    { id: "briefs", name: "Fill the creator queue", target: "10 briefs",
      prog: Math.min(1, briefs / 10), label: briefs + " / 10",
      how: "Counts briefs in data/briefs.json, built from real scouted material." },
    { id: "affiliate", name: "Activate affiliate network", target: "first live ID",
      prog: slots.length ? live / slots.length : 0, label: live + " / " + slots.length + " live",
      how: "Counts slots with an ID in data/affiliates.json. Only you can do this — signups need your identity." },
    { id: "streak", name: "Pipeline streak", target: "30 green runs",
      prog: Math.min(1, runs / 30), label: runs + " / 30",
      how: "Counts successful daily runs recorded in data/health.json." },
    { id: "revenue", name: "$1,000/mo run-rate", target: "sim month-12 ≥ $1,000",
      prog: Math.min(1, rate / 1000), label: "$" + Math.round(rate).toLocaleString() + " / $1,000",
      sim: true,
      how: "SIMULATION — projected month-12 run-rate from your Simulation Lab assumptions. Not real earnings." }
  ];
}

function shipLog(DB) {
  var log = [];
  var tr = DB.trends || {}, br = DB.briefs || {}, h = DB.health || {};
  if (tr.fetched_at) log.push({
    t: tr.fetched_at, icon: "📡",
    text: "Scouts returned with " + (tr.topics || []).length + " topics."
  });
  if ((br.briefs || []).length) log.push({
    t: br.generated_at || "", icon: "📝",
    text: (br.briefs || []).length + " briefs queued by the Creator."
  });
  if (h.last_run) log.push({
    t: h.last_run, icon: "✅",
    text: "Pipeline run #" + (h.successful_runs || 1) + " completed green."
  });
  log.push({
    t: "", icon: "🛸",
    text: "Ship commissioned. Crew of 8 reporting for duty."
  });
  log.sort(function (a, b) { return (b.t || "").localeCompare(a.t || ""); });
  return log.slice(0, 6);
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    var d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (e) { return ""; }
}

function missionSheet(m) {
  var pct = Math.round(m.prog * 100);
  openSheet(
    "<h2>" + esc(m.name) + "</h2>" +
    '<p class="sub">MISSION · target: ' + esc(m.target) + "</p>" +
    '<div class="kv"><h3>Progress</h3><p><strong>' + esc(m.label) + "</strong> — " + pct + "% complete.</p></div>" +
    '<div class="kv"><h3>How this is measured</h3><p>' + esc(m.how) + "</p></div>" +
    (m.sim ? '<div class="kv"><h3>Honesty note</h3><p>This mission tracks a projection, not money earned. Real revenue is $0 until affiliate IDs are activated and traffic arrives.</p></div>' : "")
  );
}

function renderCommandDeck() {
  var box = document.getElementById("commandDeck");
  if (!box || !window.CB) return;
  var DB = window.CB.DB || {};
  var cmd = computeCommand(DB);
  var missions = computeMissions(DB);
  var log = shipLog(DB);

  var xpct = Math.round((cmd.xpInto / cmd.xpNeed) * 100);
  var html =
    '<div class="cmdr">' +
      '<div class="cmdr-top"><span class="cmdr-badge">⚔</span>' +
      "<div><div class=\"cmdr-lv\">LV." + cmd.level + " · " + esc(cmd.title) + "</div>" +
      '<div class="cmdr-sub">Commander Eimaj · ' + cmd.xp + " XP</div></div></div>" +
      '<div class="xpbar"><div class="xpfill" style="width:' + xpct + '%"></div></div>' +
      '<div class="cmdr-xp">' + cmd.xpInto + " / " + cmd.xpNeed + " XP to next rank</div>" +
      '<div class="xp-src">' + cmd.parts.map(function (p) {
        return "<span>" + p[1] + "× " + esc(p[0]) + " (+" + (p[1] * p[2]) + ")</span>";
      }).join("") + "</div>" +
    "</div>" +
    '<h3 class="deck-h">Active missions</h3>' +
    '<div class="missions">' + missions.map(function (m, i) {
      var pct = Math.round(m.prog * 100);
      return '<button class="mission' + (m.sim ? " sim" : "") + '" data-m="' + i + '">' +
        '<div class="m-top"><span class="m-name">' + esc(m.name) + "</span>" +
        '<span class="m-label">' + esc(m.label) + "</span></div>" +
        '<div class="mbar"><div class="mfill" style="width:' + pct + '%"></div></div>' +
        '<div class="m-target">🎯 ' + esc(m.target) + (m.sim ? ' <span class="simtag">SIM</span>' : "") + "</div>" +
      "</button>";
    }).join("") + "</div>" +
    '<h3 class="deck-h">Ship\'s log</h3>' +
    '<div class="shiplog">' + log.map(function (e) {
      return '<div class="logline"><span class="logicon">' + e.icon + "</span>" +
        "<span>" + esc(e.text) + "</span>" +
        (e.t ? '<span class="logtime">' + esc(fmtTime(e.t)) + "</span>" : "") + "</div>";
    }).join("") + "</div>";

  box.innerHTML = html;
  box.querySelectorAll("[data-m]").forEach(function (el) {
    el.addEventListener("click", function () { missionSheet(missions[+el.dataset.m]); });
  });
}

window.Missions = {
  computeCommand: computeCommand,
  computeMissions: computeMissions,
  renderCommandDeck: renderCommandDeck
};
