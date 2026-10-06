/* Compare Building — interactive comparison engine. All data from data/*.json. */
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const num = (id, dflt) => { const v = parseFloat($(id).value); return isFinite(v) ? v : dflt; };
const money = (n) => "$" + Number(n).toLocaleString("en-US", {maximumFractionDigits: n < 100 ? 2 : 0});

let DB = {cards: [], brokers: [], affiliates: {slots: []}, assumptions: {}, trends: {topics: []}, briefs: {briefs: []}};
let state = {vertical: "all", tag: null, paused: false, speed: 1};

/* ---------------- building ---------------- */
const FLOORS = [
  {no: "F1", name: "Scouts", dept: "Trend intelligence", color: "#4cc9f0", agents: [
    {id: "S-1", name: "Newswire", task: "Scans Google News RSS every morning for credit-card and brokerage topics.",
     from: [], to: [["D-1 · Factcheck", "verified topic queue"]],
     reasoning: "Fresh topics keep comparisons relevant. Only real headlines — never invented."},
    {id: "S-2", name: "Forumwatch", task: "Filters Hacker News for finance discussions and real reader questions.",
     from: [], to: [["D-1 · Factcheck", "reader questions"]],
     reasoning: "Real questions reveal what people actually want compared."}]},
  {no: "F2", name: "Data", dept: "Fact tables", color: "#f4a261", agents: [
    {id: "D-1", name: "Factcheck", task: "Keeps only high-confidence public facts; marks the rest unverified or omits them.",
     from: [["S-1 · Newswire", "topic queue"], ["S-2 · Forumwatch", "reader questions"]], to: [["C-1 · Ranker", "verified tables"]],
     reasoning: "One wrong fee destroys trust. Unsure means omitted or flagged — never guessed."},
    {id: "D-2", name: "Tables", task: "Maintains the card and brokerage comparison tables from verified facts.",
     from: [["D-1 · Factcheck", "verified facts"]], to: [["C-1 · Ranker", "sortable tables"], ["C-2 · Quizmaster", "verified tables"]],
     reasoning: "Structured facts make honest comparison possible."}]},
  {no: "F3", name: "Compare", dept: "Decision help", color: "#c77dff", agents: [
    {id: "C-1", name: "Ranker", task: "Sorts and filters tables by fee, rewards, and best-for tags.",
     from: [["D-2 · Tables", "comparison tables"]], to: [["M-1 · Linker", "ranked products"]],
     reasoning: "The right filter answers the visitor's question faster than ten open tabs."},
    {id: "C-2", name: "Quizmaster", task: "Runs the 'best for X' quiz: cash back vs travel vs no annual fee.",
     from: [["D-2 · Tables", "comparison tables"]], to: [["visitor", "personalized shortlist"]],
     reasoning: "Three honest answers beat thirty tabs of research."}]},
  {no: "F4", name: "Monetize", dept: "Revenue", color: "#3ddc97", agents: [
    {id: "M-1", name: "Linker", task: "Auto-links product mentions when affiliate IDs are set (rel=sponsored).",
     from: [["C-1 · Ranker", "ranked products"]], to: [["visitor", "monetized links"]],
     reasoning: "One ID activates every link site-wide. Empty IDs stay honestly 'coming soon'."},
    {id: "M-2", name: "Simulator", task: "Projects 12-month fake revenue from real site data plus your assumptions.",
     from: [["D-2 · Tables", "product roster"], ["S-1 · Newswire", "trend weights"]], to: [["visitor", "transparent projection"]],
     reasoning: "Shows the math that would make $1,000/mo real — or proves it isn't."}]},
];

/* Exposed for the spaceship mission-control scene (spaceship.js). */
window.CB = { FLOORS: FLOORS, state: state, DB: DB, agentSheet: agentSheet, floorSheet: floorSheet };

function agentSheet(a, f) {
  const from = a.from.length
    ? a.from.map(([s, w]) => `<div class="flowline"><span class="from">${esc(s)}</span><span class="arrow">→</span><span>${esc(w)}</span></div>`).join("")
    : `<p>Runs on its own schedule — needs no inputs.</p>`;
  const to = a.to.map(([s, w]) => `<div class="flowline"><span>${esc(w)}</span><span class="arrow">→</span><span class="to">${esc(s)}</span></div>`).join("");
  openSheet(`<h2>${esc(a.id)} · ${esc(a.name)}</h2><p class="sub">${esc(f.no)} — ${esc(f.name)} · ${esc(f.dept)}</p>
    <div class="kv"><h3>Current task</h3><p>${esc(a.task)}</p></div>
    <div class="kv"><h3>Receives from</h3>${from}</div>
    <div class="kv"><h3>Sends to</h3>${to}</div>
    <div class="kv"><h3>Why it works this way</h3><p>${esc(a.reasoning)}</p></div>`);
}

function floorSheet(f) {
  openSheet(`<h2>${esc(f.no)} — ${esc(f.name)}</h2><p class="sub">${esc(f.dept)}</p>
    <div class="kv"><h3>Agents on this floor</h3><ul>${f.agents.map((a) =>
      `<li><strong>${esc(a.id)} · ${esc(a.name)}</strong> — ${esc(a.task)}</li>`).join("")}</ul></div>
    <div class="kv"><h3>How it fits the whole</h3><p>Every floor hands verified work to the next. Nothing downstream ever sees an unverified fact or a fake link.</p></div>`);
}

/* ---------------- sheet ---------------- */
function openSheet(html) { $("sheetBody").innerHTML = html; $("sheetWrap").hidden = false; }
function closeSheet() { $("sheetWrap").hidden = true; }


/* ---------------- products ---------------- */
function allProducts() {
  return [
    ...DB.cards.map((c) => ({...c, kind: "card", keyFact: `Annual fee ${c.annual_fee}`, detail: c.rewards_summary})),
    ...DB.brokers.map((b) => ({...b, kind: "broker", keyFact: `${b.stock_etf_commission} stock/ETF trades`, detail: `Fractional shares: ${b.fractional_shares}. Minimum ${b.account_minimum}.`})),
  ];
}
function visibleProducts() {
  let list = allProducts();
  if (state.vertical === "cards" || state.vertical === "brokers")
    list = list.filter((p) => p.kind === state.vertical.slice(0, -1)); // "cards"->"card"
  if (state.tag) list = list.filter((p) => (p.best_for || []).includes(state.tag));
  return list;
}
function affSlotFor(kind) {
  const id = kind === "card" ? "card-network" : "broker-network";
  return (DB.affiliates.slots || []).find((s) => s.id === id);
}
function renderTagChips() {
  const pool = state.vertical === "all" ? allProducts()
    : allProducts().filter((p) => p.kind === state.vertical.slice(0, -1));
  const tags = [...new Set(pool.flatMap((p) => p.best_for || []))].sort();
  $("tagChips").innerHTML = `<button class="chip" data-tag="" aria-selected="${state.tag === null}">All tags</button>` +
    tags.map((t) => `<button class="chip" data-tag="${esc(t)}" aria-selected="${state.tag === t}">${esc(t)}</button>`).join("");
  $("tagChips").querySelectorAll("[data-tag]").forEach((el) => {
    el.addEventListener("click", () => {
      state.tag = el.dataset.tag || null;
      renderTagChips(); renderProducts();
    });
  });
}
function renderProducts() {
  const list = visibleProducts();
  $("productGrid").innerHTML = list.length ? list.map((p) => `
    <button class="pcard" data-pid="${esc(p.id)}" data-kind="${p.kind}">
      <div class="pcard-top"><span class="vtag">${p.kind === "card" ? "CARD" : "BROKER"}</span>
        <span class="pcard-fee">${esc(p.keyFact)}</span></div>
      <div class="pcard-name">${esc(p.name)}</div>
      <div class="pcard-rew">${esc(p.detail)}</div>
      <div class="tagrow">${(p.best_for || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    </button>`).join("")
    : `<div class="empty">No products match this filter.</div>`;
  $("productGrid").querySelectorAll("[data-pid]").forEach((el) => {
    el.addEventListener("click", () => {
      const p = allProducts().find((x) => x.id === el.dataset.pid);
      if (p) productSheet(p);
    });
  });
}
function productSheet(p) {
  const slot = affSlotFor(p.kind);
  const aff = slot && slot.sub_id
    ? `<a class="live" href="#" rel="sponsored">Apply / open account →</a><span class="spon">Sponsored link — we may earn a commission.</span>`
    : `<span class="soon">AFFILIATE LINK: COMING SOON — needs ${esc(slot ? slot.id_template : "affiliate ID")}</span>`;
  const rows = p.kind === "card"
    ? `<div class="kv"><h3>Annual fee</h3><p>${esc(p.annual_fee)}</p></div>
       <div class="kv"><h3>Rewards</h3><p>${esc(p.rewards_summary)}</p></div>`
    : `<div class="kv"><h3>Stock/ETF commission</h3><p>${esc(p.stock_etf_commission)}</p></div>
       <div class="kv"><h3>Account minimum</h3><p>${esc(p.account_minimum)}</p></div>
       <div class="kv"><h3>Fractional shares</h3><p>${esc(p.fractional_shares)}</p></div>`;
  openSheet(`<h2>${esc(p.name)}</h2><p class="sub">${esc(p.kind === "card" ? p.issuer : "Brokerage")} · ${esc(p.keyFact)}</p>
    ${rows}
    <div class="kv"><h3>Best for</h3><p>${(p.best_for || []).map(esc).join(" · ")}</p></div>
    <div class="kv"><h3>Honesty note</h3><p>${esc(p.note || "")}</p></div>
    <div class="kv"><h3>Monetization</h3><p>${aff}</p></div>`);
}

/* ---------------- quiz ---------------- */
const QUIZ = [
  {q: "What matters most to you?", opts: [["Cash back", "cash back"], ["Travel rewards", "travel"], ["No annual fee", "no annual fee"]]},
  {q: "Okay with an annual fee?", opts: [["Yes, if the perks pay off", "fee-ok"], ["No — $0 only", "fee-no"]]},
  {q: "Pick your style", opts: [["Simple flat rewards", "simplicity"], ["Squeeze every category", "rotating categories"], ["Points I can transfer", "transfer partners"]]},
];
let quizStep = 0, quizAns = [];
function renderQuiz() {
  quizStep = 0; quizAns = [];
  quizShow();
}
function quizShow() {
  const box = $("quizQ"), res = $("quizResult");
  res.innerHTML = "";
  if (quizStep >= QUIZ.length) { quizFinish(); box.innerHTML = ""; return; }
  const q = QUIZ[quizStep];
  box.innerHTML = `<div class="qcard"><h3>${quizStep + 1}. ${esc(q.q)}</h3><div class="qopts">` +
    q.opts.map(([label], i) => `<button class="qopt" data-i="${i}">${esc(label)}</button>`).join("") + `</div></div>`;
  box.querySelectorAll("[data-i]").forEach((el) => {
    el.addEventListener("click", () => { quizAns.push(QUIZ[quizStep].opts[+el.dataset.i][1]); quizStep++; quizShow(); });
  });
}
function quizFinish() {
  const [want, fee, style] = quizAns;
  let cards = DB.cards.slice();
  if (fee === "fee-no") cards = cards.filter((c) => c.annual_fee === "$0");
  const scored = cards.map((c) => {
    let s = 0; const why = [];
    for (const tag of [want, style]) {
      if ((c.best_for || []).includes(tag)) { s += 2; why.push(tag); }
    }
    return {c, s, why};
  }).sort((a, b) => b.s - a.s).slice(0, 3);
  $("quizResult").innerHTML = `<div class="qcard"><h3>Your shortlist</h3>` +
    (scored.length ? scored.map(({c, s, why}) => `
      <div class="kv"><h3>${esc(c.name)} — match score ${s}</h3>
      <p>${esc(c.rewards_summary)} Fee: ${esc(c.annual_fee)}.</p>
      <p class="tiny">Matched: ${why.length ? why.map(esc).join(", ") : "available after your fee filter"} · ${esc(c.note || "")}</p></div>`).join("")
      : `<p>No cards match — try allowing an annual fee.</p>`) +
    `<button class="btn" id="quizAgain">↺ Retake quiz</button></div>`;
  const again = $("quizAgain");
  if (again) again.addEventListener("click", renderQuiz);
}

/* ---------------- simulation ---------------- */
function simParams() {
  return {
    v0: Math.max(0, num("a_visitors", 500)),
    g: num("a_growth", 15) / 100,
    ctr: num("a_ctr", 8) / 100,
    appr: num("a_approval", 5) / 100,
    payout: Math.max(0, num("a_payout", 75)),
    months: Math.min(36, Math.max(1, Math.round(num("a_months", 12)))),
  };
}
function simRun(animate) {
  const p = simParams();
  const perVisitor = p.ctr * p.appr * p.payout;
  const products = allProducts();
  const monthly = [];
  let v = p.v0, total = 0, totV = 0;
  for (let m = 1; m <= p.months; m++) {
    const rev = v * perVisitor;
    monthly.push({m, visitors: Math.round(v), revenue: rev});
    total += rev; totV += v; v *= (1 + p.g);
  }
  const last = monthly[monthly.length - 1];
  $("simStats").innerHTML = `
    <div class="stat"><div class="v">${money(total)}</div><div class="l">FAKE ${p.months}-MO TOTAL</div></div>
    <div class="stat"><div class="v">${money(last.revenue)}</div><div class="l">FAKE MO ${p.months} RUN RATE</div></div>
    <div class="stat"><div class="v">${Math.round(totV).toLocaleString()}</div><div class="l">TOTAL VISITORS</div></div>`;
  // $1,000/mo readout
  let targetHtml;
  if (perVisitor <= 0) {
    targetHtml = `<strong>What it takes to hit $1,000/mo:</strong> impossible — with 0% click-through, approval, or payout, no visitor count earns anything. Raise an assumption above zero.`;
  } else {
    const req = Math.ceil(1000 / perVisitor);
    let when;
    if (req <= p.v0) when = "already — your starting traffic clears it";
    else if (p.g <= 0) when = "never at 0% growth — traffic never reaches it";
    else {
      const m = 1 + Math.ceil(Math.log(req / p.v0) / Math.log(1 + p.g));
      when = `month ${m} at current growth`;
    }
    targetHtml = `<strong>What it takes to hit $1,000/mo fake:</strong> <strong>${req.toLocaleString()} monthly visitors</strong> at current conversion (${(p.ctr * 100)}% click × ${(p.appr * 100)}% approval × $${p.payout}). That happens in <strong>${when}</strong>.`;
  }
  $("simTarget").innerHTML = targetHtml;
  // per-product table (even split — labeled assumption)
  const share = total / Math.max(1, products.length);
  $("simTable").innerHTML = `<table class="sim"><tr><th>Product</th><th>Type</th><th>12-mo share</th></tr>` +
    products.map((pr) => `<tr><td>${esc(pr.name)}</td><td>${pr.kind}</td><td class="num">${money(share)}</td></tr>`).join("") + `</table>`;
  $("simNote").textContent =
    `Reality check: month 1 projects ${money(monthly[0].revenue)} from ${monthly[0].visitors.toLocaleString()} visitors — ` +
    `that's ${Math.round(monthly[0].visitors * p.ctr).toLocaleString()} clicks and ${Math.round(monthly[0].visitors * p.ctr * p.appr).toLocaleString()} approvals on paper. ` +
    `Revenue follows traffic; there are no shortcuts, and these are guesses, not measurements.`;
  drawSimChart(monthly, animate ? 0 : monthly.length);
}
function drawSimChart(monthly, upto) {
  const cv = $("simChart"), W = cv.parentElement.clientWidth - 0;
  cv.width = W; cv.height = 180;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, W, 180);
  const max = Math.max(...monthly.map((d) => d.revenue), 1);
  const bw = W / monthly.length;
  monthly.slice(0, upto).forEach((d, i) => {
    const h = Math.max(3, (d.revenue / max) * 150);
    const x = i * bw + bw * 0.18, w = bw * 0.64;
    const grd = ctx.createLinearGradient(0, 150 - h, 0, 150);
    grd.addColorStop(0, "#3ddc97"); grd.addColorStop(1, "#1d7a52");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.roundRect(x, 150 - h, w, h, 4); ctx.fill();
    if (monthly.length <= 12) {
      ctx.fillStyle = "#8ba0ad"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("M" + d.m, x + w / 2, 168);
    }
  });
  ctx.fillStyle = "#8ba0ad"; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("FAKE revenue / month", 8, 14);
}
let simTimer = null;
function simAnimate() {
  const p = simParams();
  if (simTimer) clearInterval(simTimer);
  let i = 0;
  const monthly = [];
  let v = p.v0;
  const perVisitor = p.ctr * p.appr * p.payout;
  for (let m = 1; m <= p.months; m++) { monthly.push({m, visitors: Math.round(v), revenue: v * perVisitor}); v *= (1 + p.g); }
  simRun(false);
  if (state.paused) { drawSimChart(monthly, monthly.length); return; }
  const step = () => {
    i++;
    drawSimChart(monthly, i);
    if (i < monthly.length) simTimer = setTimeout(step, Math.max(60, 420 / state.speed));
  };
  drawSimChart(monthly, 0); step();
}

/* ---------------- scout / briefs / affiliates ---------------- */
function renderScout() {
  const topics = DB.trends.topics || [];
  $("trendList").innerHTML = topics.length ? topics.slice(0, 10).map((t) => `
    <div class="trend"><a href="${esc(t.link || "#")}" target="_blank" rel="noopener">${esc(t.title)}</a>
    <div class="src">${esc(t.source || "")}${t.published ? " · " + esc(t.published) : ""}</div></div>`).join("")
    : `<div class="empty">Waiting for the first scout run.</div>`;
  const briefs = (DB.briefs.briefs || []);
  $("briefList").innerHTML = briefs.length ? briefs.map((b) => `
    <div class="brief"><h4>${esc((b.headline_options || ["Untitled"])[0])}</h4>
    <ul>${(b.outline || []).slice(0, 4).map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`).join("")
    : `<div class="empty">No briefs yet.</div>`;
  const upd = DB.trends.fetched_at;
  if (upd) $("updatedAt").textContent = "scouted " + esc(upd.replace("T", " ").replace("Z", " UTC"));
}
function renderAffiliates() {
  const slots = DB.affiliates.slots || [];
  $("affSlots").innerHTML = slots.map((s) => `
    <div class="aff"><h4>${esc(s.label)}</h4>
      <p>Network: ${esc(s.network || "—")} · Template: <code>${esc(s.id_template || "—")}</code></p>
      <p>${esc(s.note || "")}</p>
      ${s.sub_id
        ? `<span class="live">● LIVE — links active (rel="sponsored")</span>`
        : `<span class="soon">COMING SOON — needs ${esc(s.id_template || "affiliate ID")}</span>`}
    </div>`).join("");
}

/* ---------------- controls ---------------- */
function bindControls() {
  const setVert = (v) => {
    state.vertical = v; state.tag = null;
    for (const [id, vv] of [["vertAll", "all"], ["vertCards", "cards"], ["vertBrokers", "brokers"],
                            ["tabCards", "cards"], ["tabBrokers", "brokers"]])
      $(id).setAttribute("aria-selected", vv === v || (vv === "all" && v === "all"));
    renderTagChips(); renderProducts();
  };
  $("vertAll").addEventListener("click", () => setVert("all"));
  $("vertCards").addEventListener("click", () => setVert("cards"));
  $("vertBrokers").addEventListener("click", () => setVert("brokers"));
  $("tabCards").addEventListener("click", () => setVert("cards"));
  $("tabBrokers").addEventListener("click", () => setVert("brokers"));
  $("pauseBtn").addEventListener("click", () => {
    state.paused = !state.paused;
    $("pauseBtn").textContent = state.paused ? "▶ Resume motion" : "⏸ Pause motion";
  });
  $("speedRange").addEventListener("input", () => {
    state.speed = parseFloat($("speedRange").value);
    $("speedVal").textContent = state.speed + "×";
  });
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheetBackdrop").addEventListener("click", closeSheet);
  $("runSim").addEventListener("click", simAnimate);
  for (const id of ["a_visitors", "a_growth", "a_ctr", "a_approval", "a_payout", "a_months"])
    $(id).addEventListener("input", () => simRun(false));
}

/* ---------------- init ---------------- */
async function loadJSON(path, fallback) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw 0;
    return await r.json();
  } catch (e) { return fallback; }
}
async function init() {
  const [cards, brokers, affiliates, assumptions, trends, briefs] = await Promise.all([
    loadJSON("data/cards.json", {cards: []}), loadJSON("data/brokers.json", {brokers: []}),
    loadJSON("data/affiliates.json", {slots: []}), loadJSON("data/assumptions.json", {}),
    loadJSON("data/trends.json", {topics: []}), loadJSON("data/briefs.json", {briefs: []}),
  ]);
  DB.cards = cards.cards || []; DB.brokers = brokers.brokers || [];
  DB.affiliates = affiliates; DB.trends = trends; DB.briefs = briefs;
  if (cards.last_verified) $("verifiedDate").textContent = esc(cards.last_verified);
  const a = assumptions;
  const fill = (id, v) => { if (v !== undefined && $(id)) $(id).value = v; };
  fill("a_visitors", a.start_monthly_visitors); fill("a_growth", a.monthly_growth_pct);
  fill("a_ctr", a.click_through_pct); fill("a_approval", a.approval_rate_pct);
  fill("a_payout", a.avg_payout_usd); fill("a_months", a.months);
  bindControls();
  renderTagChips(); renderProducts(); renderQuiz();
  renderScout(); renderAffiliates();
  simRun(false);
  if (window.ShipSim) window.ShipSim.start();
}
document.addEventListener("DOMContentLoaded", init);
