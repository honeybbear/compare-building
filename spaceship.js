/* Compare Building — Spaceship Mission Control.
   A Rick & Morty-style crew works the real daily pipeline, live on canvas.
   Starfield, 4-deck ship, walking crew, data packets riding the elevator,
   consoles with live screens, and a HUD fed by the real data/*.json. */
"use strict";
(function () {
  var TAU = Math.PI * 2;
  var cv = null, ctx = null, W = 0, H = 0, dpr = 1;
  var t = 0, running = false;
  var stars = [], shoot = null, shootTimer = 5;
  var agents = [], packets = [], flashes = [], pings = [], coins = [];
  var elev = { y: 0, ty: 0 };
  var shipBob = 0, scanTimer = 3, ambientTimer = 2;
  var deckRects = [];
  var geomNow = null;

  function CB() { return window.CB || {}; }
  function ST() { return CB().state || { paused: false, speed: 1 }; }
  function DB() { return CB().DB || {}; }
  function FLOORS() { return CB().FLOORS || []; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function money(n) {
    return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });
  }

  /* ---------------- live stats from real data ---------------- */
  function stats() {
    var d = DB();
    var topics = (d.trends && d.trends.topics || []).length;
    var briefs = (d.briefs && d.briefs.briefs || []).length;
    var products = ((d.cards || []).length) + ((d.brokers || []).length);
    var a = d.assumptions || {};
    var v0 = +a.start_monthly_visitors || 500, g = (+a.monthly_growth_pct || 15) / 100;
    var ctr = (+a.click_through_pct || 8) / 100, appr = (+a.approval_rate_pct || 5) / 100;
    var pay = +a.avg_payout_usd || 75;
    var rate = v0 * Math.pow(1 + g, 11) * ctr * appr * pay;
    var fetched = d.trends && d.trends.fetched_at ? Date.parse(d.trends.fetched_at) : 0;
    var staleH = fetched ? (Date.now() - fetched) / 36e5 : 9999;
    return { topics: topics, briefs: briefs, products: products, rate: rate, stale: staleH > 36 };
  }

  /* ---------------- geometry ---------------- */
  function geom() {
    var shipW = Math.min(W * 0.8, 330);
    var sx = (W - shipW) / 2;
    var topY = 70, botY = H - 100;
    var deckH = (botY - topY) / 4;
    return {
      sx: sx, sw: shipW, top: topY + shipBob, deckH: deckH, bot: botY + shipBob,
      shaftX: sx + shipW - 36, shaftW: 24,
      deckY: function (i) { return topY + shipBob + i * deckH; },
      deckCY: function (i) { return topY + shipBob + (i + 0.5) * deckH; }
    };
  }

  /* ---------------- crew ---------------- */
  var SKINS = ["#f6cf9f", "#eebd8a", "#d99e6f", "#f6cf9f", "#eebd8a", "#c98a5e", "#f6cf9f", "#eebd8a"];
  var HAIRC = ["#7fb3e8", "#5b8dd9", "#9fd4ff", "#7fb3e8", "#5b8dd9", "#9fd4ff", "#7fb3e8", "#5b8dd9"];
  var HAIRS = ["spiky", "flat", "tuft", "spiky", "flat", "tuft", "spiky", "flat"];

  function buildCrew() {
    agents = [];
    var fl = FLOORS();
    var k = 0;
    fl.forEach(function (f, fi) {
      (f.agents || []).forEach(function (a, ai) {
        agents.push({
          fi: fi, ai: ai, meta: a, floor: f,
          x: 0, mode: "idle", timer: rnd(0.5, 2), tx: 0,
          phase: rnd(0, TAU), walkAmp: 1, flip: false,
          skin: SKINS[k % SKINS.length], hair: HAIRC[k % HAIRC.length],
          hairStyle: HAIRS[k % HAIRS.length], coat: f.color || "#8ba0ad",
          carry: null, screen: null, label: a.id
        });
        k++;
      });
    });
    var g = geom();
    agents.forEach(function (p) {
      p.x = g.sx + 60 + p.ai * 110 + rnd(-8, 8);
      p.homeX = p.x;
    });
    elev.y = g.deckCY(0); elev.ty = elev.y;
  }

  function agentById(id) {
    for (var i = 0; i < agents.length; i++) if (agents[i].meta.id === id) return agents[i];
    return null;
  }

  /* ---------------- packets & fx ---------------- */
  function spawnPacket(fromDeck, color) {
    var carriers = { 0: "S-1", 1: "D-2", 2: "C-1" };
    var c = agentById(carriers[fromDeck]);
    var g = geom();
    var pk = { from: fromDeck, to: fromDeck + 1, color: color, state: "wait", p: 0,
               x: g.sx + 70, y: g.deckCY(fromDeck) };
    packets.push(pk);
    if (c && !c.carry && c.mode !== "sleep") { c.carry = pk; c.mode = "fetch"; pk.state = "agent"; }
    return pk;
  }
  function flash(x, y, color, text) { flashes.push({ x: x, y: y, life: 1, color: color, text: text || "" }); }
  function ping(x, y) { pings.push({ x: x, y: y, r: 6, life: 1 }); }

  /* ---------------- per-agent brains ---------------- */
  function walkTo(p, tx, dt, spd) {
    var dx = tx - p.x;
    p.flip = dx < 0;
    if (Math.abs(dx) < 3) { p.x = tx; return true; }
    p.x += clamp(dx, -spd * dt, spd * dt);
    p.phase += dt * 9;
    return false;
  }

  function brain(p, dt, g, s) {
    var id = p.meta.id;
    var shaftX = g.shaftX + g.shaftW / 2;
    var deckL = g.sx + 26, deckR = g.shaftX - 14;

    if (s.stale && (id === "S-1" || id === "S-2")) {
      p.mode = "sleep"; return; // scouts stand down when no fresh scout data
    }
    if (p.mode === "sleep" && !s.stale) { p.mode = "idle"; p.timer = 0.5; }

    switch (id) {
      case "S-1": { // Newswire: scan at dish, then ferry packet to elevator
        var dishX = deckR - 20;
        if (p.mode === "idle" || p.mode === "walk") {
          if (walkTo(p, dishX, dt, 70)) { p.mode = "scan"; p.timer = 2.4; }
          else p.mode = "walk";
        } else if (p.mode === "scan") {
          p.timer -= dt;
          if (Math.random() < 0.25) ping(g.sx + g.sw / 2, g.top - 46);
          if (p.timer <= 0) {
            spawnPacket(0, p.floor.color);
            p.mode = "carry";
          }
        } else if (p.mode === "carry" || p.mode === "fetch") {
          if (p.carry) {
            if (p.mode === "fetch") {
              if (walkTo(p, p.carry.x, dt, 80)) p.mode = "carry";
            } else if (walkTo(p, shaftX - 16, dt, 80)) {
              p.carry.state = "shaft"; p.carry.x = shaftX; p.carry = null;
              p.mode = "walk"; p.tx = p.homeX;
            }
          } else p.mode = "walk";
        } else if (p.mode === "walk") {
          if (walkTo(p, p.homeX, dt, 60)) { p.mode = "idle"; p.timer = rnd(1, 3); }
        } else { p.timer -= dt; if (p.timer <= 0) p.mode = "walk"; }
        break;
      }
      case "S-2": { // Forumwatch: wander + type at console
        if (p.mode === "idle") { p.timer -= dt; if (p.timer <= 0) { p.mode = "walk"; p.tx = rnd(deckL + 30, deckR - 30); } }
        else if (p.mode === "walk") { if (walkTo(p, p.tx, dt, 55)) { p.mode = Math.random() < 0.5 ? "work" : "idle"; p.timer = rnd(1.5, 3.5); } }
        else { p.mode = "work"; p.timer -= dt; if (p.timer <= 0) { p.mode = "idle"; p.timer = rnd(0.5, 2); } }
        break;
      }
      case "D-1": { // Factcheck: work at console, stamp arriving packets
        p.mode = "work"; p.x += (p.homeX - p.x) * Math.min(1, dt * 3);
        break;
      }
      case "D-2": { // Tables: ferry packets deck1 -> deck2
        if (p.carry) {
          if (p.mode === "fetch") { if (walkTo(p, p.carry.x, dt, 80)) p.mode = "carry"; }
          else if (walkTo(p, shaftX - 16, dt, 80)) {
            p.carry.state = "shaft"; p.carry.x = shaftX; p.carry = null;
            p.mode = "walk";
          }
        } else if (p.mode === "walk") {
          if (walkTo(p, p.homeX, dt, 60)) { p.mode = "idle"; p.timer = rnd(1, 2.5); }
        } else { p.mode = "idle"; p.timer -= dt; if (p.timer <= 0) p.mode = "walk"; }
        break;
      }
      case "C-1": { // Ranker: work, ferry packets deck2 -> deck3
        if (p.carry) {
          if (p.mode === "fetch") { if (walkTo(p, p.carry.x, dt, 80)) p.mode = "carry"; }
          else if (walkTo(p, shaftX - 16, dt, 80)) {
            p.carry.state = "shaft"; p.carry.x = shaftX; p.carry = null;
            p.mode = "walk";
          }
        } else { p.mode = "work"; p.x += (p.homeX - p.x) * Math.min(1, dt * 3); }
        break;
      }
      case "C-2": { // Quizmaster: work at console, wave at visitors
        p.mode = "work"; p.x += (p.homeX - p.x) * Math.min(1, dt * 3);
        break;
      }
      case "M-1": { // Linker: polish the (dim) link hologram, ship coins on arrival
        p.mode = "work"; p.x += (p.homeX - p.x) * Math.min(1, dt * 3);
        break;
      }
      case "M-2": { // Simulator: watch the hologram projection
        p.mode = "watch"; p.x += (p.homeX - p.x) * Math.min(1, dt * 3);
        break;
      }
    }
  }

  function update(dt) {
    var g = geom(); geomNow = g;
    var s = stats();
    shipBob = Math.sin(t * 0.9) * 5;

    // stars
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.y += st.v * dt; st.tw += dt * 3;
      if (st.y > H) { st.y = -2; st.x = rnd(0, W); }
    }
    shootTimer -= dt;
    if (shootTimer <= 0 && !shoot) { shoot = { x: rnd(W * 0.3, W), y: -10, vx: -260, vy: 160, life: 1 }; shootTimer = rnd(6, 14); }
    if (shoot) {
      shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life -= dt * 0.7;
      if (shoot.life <= 0 || shoot.x < -40) shoot = null;
    }

    // ambient packet spawner (scout cycle) — only when data is fresh
    if (!s.stale) {
      scanTimer -= dt;
      if (scanTimer <= 0) { scanTimer = rnd(9, 14); var s1 = agentById("S-1"); if (s1 && !s1.carry && s1.mode !== "sleep") { s1.mode = "walk"; } }
    }

    // agents
    for (var a = 0; a < agents.length; a++) brain(agents[a], dt, g, s);

    // packets in shaft
    var shaftX = g.shaftX + g.shaftW / 2;
    for (var k = packets.length - 1; k >= 0; k--) {
      var pk = packets[k];
      if (pk.state === "agent" && pk.agent !== true) {
        // carried visually by agent; position follows carrier
        var carrier = null;
        for (var c = 0; c < agents.length; c++) if (agents[c].carry === pk) carrier = agents[c];
        if (carrier) { pk.x = carrier.x + (carrier.flip ? -6 : 6); pk.y = g.deckCY(pk.from) - 62; }
        else if (pk.state === "agent") { pk.state = "shaft"; }
      }
      if (pk.state === "shaft") {
        var targetY = g.deckCY(pk.to);
        elev.ty = targetY;
        pk.y += clamp(targetY - pk.y, -90 * dt, 90 * dt);
        pk.x = shaftX;
        if (Math.abs(targetY - pk.y) < 4) {
          packets.splice(k, 1);
          onArrive(pk, g);
        }
      } else if (pk.state === "wait") {
        packets.splice(k, 1);
      }
    }
    // elevator car eases toward target
    elev.y += (elev.ty - elev.y) * Math.min(1, dt * 4);

    // fx
    for (var f = flashes.length - 1; f >= 0; f--) { flashes[f].life -= dt * 1.4; if (flashes[f].life <= 0) flashes.splice(f, 1); }
    for (var q = pings.length - 1; q >= 0; q--) { pings[q].r += dt * 60; pings[q].life -= dt * 0.8; if (pings[q].life <= 0) pings.splice(q, 1); }
    for (var n = coins.length - 1; n >= 0; n--) {
      var cn = coins[n];
      cn.x += cn.vx * dt; cn.y += cn.vy * dt; cn.vy += 60 * dt; cn.life -= dt;
      if (cn.life <= 0) coins.splice(n, 1);
    }
  }

  function onArrive(pk, g) {
    var x = g.shaftX - 30, y = g.deckCY(pk.to);
    flash(x, y, pk.color, "✓");
    if (pk.to === 1) { var d2 = agentById("D-2"); if (d2 && !d2.carry) { setTimeout(function () { if (!d2.carry && d2.mode !== "sleep") spawnPacket(1, "#f4a261"); }, 1200); } }
    if (pk.to === 2) { var c1 = agentById("C-1"); if (c1 && !c1.carry) { setTimeout(function () { if (!c1.carry) spawnPacket(2, "#c77dff"); }, 1200); } }
    if (pk.to === 3) {
      var m1 = agentById("M-1");
      if (m1) {
        flash(m1.x, y - 40, "#3ddc97", "+$");
        for (var i = 0; i < 3; i++) coins.push({ x: m1.x + 10, y: y - 30, vx: rnd(60, 140), vy: rnd(-70, -20), life: rnd(0.8, 1.4) });
      }
    }
  }

  /* ---------------- drawing ---------------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStars() {
    ctx.fillStyle = "#04060c"; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = 0.35 + 0.65 * Math.abs(Math.sin(s.tw));
      ctx.globalAlpha = a * s.b;
      ctx.fillStyle = "#cfe6ff";
      ctx.fillRect(s.x, s.y, s.sz, s.sz);
    }
    ctx.globalAlpha = 1;
    if (shoot) {
      var gr = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x + 60, shoot.y - 36);
      gr.addColorStop(0, "rgba(255,255,255," + (0.9 * shoot.life) + ")");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = gr; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x + 60, shoot.y - 36); ctx.stroke();
    }
    // distant planet
    ctx.globalAlpha = 0.5;
    var pg = ctx.createRadialGradient(W * 0.85, H * 0.12, 4, W * 0.85, H * 0.12, 46);
    pg.addColorStop(0, "#274b73"); pg.addColorStop(1, "#0b1626");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(W * 0.85, H * 0.12, 40, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawShip(g) {
    var x = g.sx, w = g.sw, top = g.top, bot = g.bot, h = bot - top;
    // engine glow + flames
    var fl = 1 + Math.sin(t * 22) * 0.18 + Math.sin(t * 47) * 0.1;
    for (var e = -1; e <= 1; e++) {
      var ex = x + w / 2 + e * w * 0.22;
      var fg = ctx.createLinearGradient(0, bot, 0, bot + 44 * fl);
      fg.addColorStop(0, "rgba(255,220,120,0.95)"); fg.addColorStop(0.5, "rgba(255,140,60,0.7)"); fg.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(ex - 13, bot); ctx.lineTo(ex + 13, bot); ctx.lineTo(ex, bot + 44 * fl); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "rgba(120,180,255,0.12)";
    ctx.beginPath(); ctx.ellipse(x + w / 2, bot + 26, w * 0.42, 26, 0, 0, TAU); ctx.fill();

    // hull
    var hg = ctx.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, "#1b2a3d"); hg.addColorStop(0.12, "#2c435e"); hg.addColorStop(0.5, "#3a5578");
    hg.addColorStop(0.88, "#2c435e"); hg.addColorStop(1, "#16222f");
    ctx.fillStyle = hg;
    rr(x, top, w, h, 46); ctx.fill();
    ctx.strokeStyle = "rgba(140,190,240,0.35)"; ctx.lineWidth = 2; ctx.stroke();

    // deck separators + interiors
    var fl_ = FLOORS();
    deckRects = [];
    for (var i = 0; i < 4; i++) {
      var dy = g.deckY(i), dh = g.deckH;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      rr(x + 12, dy + 8, w - 24, dh - 16, 18); ctx.fill();
      if (i > 0) {
        ctx.strokeStyle = "rgba(140,190,240,0.25)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 14, dy); ctx.lineTo(x + w - 14, dy); ctx.stroke();
      }
      // deck plate (tappable)
      var pw = 118, px = x + 20, py = dy + 14;
      ctx.fillStyle = (fl_[i] && fl_[i].color) || "#8ba0ad";
      rr(px, py, pw, 22, 11); ctx.fill();
      ctx.fillStyle = "#06121f"; ctx.font = "700 11px system-ui,sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(((fl_[i] && fl_[i].no) || ("F" + (i + 1))) + " · " + ((fl_[i] && fl_[i].name) || "").toUpperCase(), px + 10, py + 12);
      deckRects.push({ x: px, y: py, w: pw, h: 22, fi: i });
      // porthole
      ctx.fillStyle = "rgba(160,220,255,0.9)";
      ctx.beginPath(); ctx.arc(x + 14, dy + dh / 2, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(6,18,31,0.85)";
      ctx.beginPath(); ctx.arc(x + 14, dy + dh / 2, 4.5, 0, TAU); ctx.fill();
      // blinking deck light
      var bl = (Math.sin(t * 3 + i * 1.7) + 1) / 2;
      ctx.fillStyle = "rgba(255," + Math.round(120 + 120 * bl) + ",80," + (0.4 + 0.6 * bl) + ")";
      ctx.beginPath(); ctx.arc(x + w - 16, dy + 20, 4, 0, TAU); ctx.fill();
    }

    // elevator shaft
    var shx = g.shaftX, shy = top + 10, shh = h - 20;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rr(shx, shy, g.shaftW, shh, 10); ctx.fill();
    ctx.strokeStyle = "rgba(140,190,240,0.3)"; ctx.lineWidth = 1.5; ctx.stroke();
    // elevator car
    ctx.fillStyle = "rgba(120,200,255,0.25)";
    rr(shx + 3, elev.y - 14, g.shaftW - 6, 28, 7); ctx.fill();
    ctx.strokeStyle = "rgba(160,220,255,0.8)"; ctx.stroke();

    // antenna + dish
    var ax = x + w / 2, ay = top;
    ctx.strokeStyle = "#5b7a99"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 34); ctx.stroke();
    ctx.save(); ctx.translate(ax, ay - 40); ctx.rotate(Math.sin(t * 1.4) * 0.5);
    ctx.fillStyle = "#8fb8dd";
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#d7ecff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = (Math.sin(t * 4) > 0) ? "#ff5d5d" : "#7a2a2a";
    ctx.beginPath(); ctx.arc(ax, ay - 34, 4, 0, TAU); ctx.fill();
    // dish pings
    for (var pi = 0; pi < pings.length; pi++) {
      var pg2 = pings[pi];
      ctx.strokeStyle = "rgba(120,220,255," + (pg2.life * 0.8) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pg2.x, pg2.y, pg2.r, 0, TAU); ctx.stroke();
    }
    // nose window
    ctx.fillStyle = "rgba(150,215,255,0.85)";
    ctx.beginPath(); ctx.ellipse(ax, top + 6, 30, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.ellipse(ax - 8, top + 3, 10, 4, -0.3, 0, TAU); ctx.fill();
  }

  function drawConsoles(g) {
    // per-deck consoles / props
    for (var i = 0; i < 4; i++) {
      var dy = g.deckY(i), dh = g.deckH, cy = dy + dh - 34;
      ctx.fillStyle = "#22344a";
      if (i === 0) {
        desk(g.sx + 170, cy); radarScreen(g.sx + 170, cy - 44);
        desk(g.sx + 70, cy); typeScreen(g.sx + 70, cy - 44, "#4cc9f0");
      } else if (i === 1) {
        desk(g.sx + 70, cy); stampScreen(g.sx + 70, cy - 44);
        desk(g.sx + 170, cy); typeScreen(g.sx + 170, cy - 44, "#f4a261");
      } else if (i === 2) {
        desk(g.sx + 70, cy); barScreen(g.sx + 70, cy - 52, 64, 34);
        desk(g.sx + 170, cy); quizScreen(g.sx + 170, cy - 44);
      } else {
        // link hologram pedestal + sim hologram
        ctx.fillStyle = "#22344a"; rr(g.sx + 56, cy, 44, 12, 4); ctx.fill();
        var bob = Math.sin(t * 2) * 3;
        ctx.strokeStyle = "rgba(61,220,151,0.5)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(g.sx + 78, cy - 26 + bob, 12, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(61,220,151," + (0.25 + 0.15 * Math.sin(t * 3)) + ")";
        ctx.font = "10px system-ui"; ctx.textAlign = "center";
        ctx.fillText("link?", g.sx + 78, cy - 22 + bob);
        simHologram(g.sx + 150, cy - 66, 92, 52);
      }
    }
  }
  function desk(x, y) {
    ctx.fillStyle = "#22344a"; rr(x - 26, y, 52, 12, 4); ctx.fill();
    ctx.fillStyle = "#1a2839"; ctx.fillRect(x - 22, y + 12, 6, 14); ctx.fillRect(x + 16, y + 12, 6, 14);
  }
  function screenBase(x, y, w, h) {
    ctx.fillStyle = "#0a1420"; rr(x - w / 2, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = "rgba(140,190,240,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function radarScreen(x, y) {
    screenBase(x, y, 52, 34);
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 26, y, 52, 34); ctx.clip();
    var a = t * 2.2;
    ctx.strokeStyle = "rgba(76,201,240,0.9)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.lineTo(x + Math.cos(a) * 22, y + 17 + Math.sin(a) * 14); ctx.stroke();
    ctx.fillStyle = "rgba(76,201,240,0.9)";
    for (var i = 0; i < 4; i++) {
      var px = x - 18 + ((i * 37 + t * 7) % 36), py = y + 6 + ((i * 53) % 22);
      ctx.beginPath(); ctx.arc(px, py, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function typeScreen(x, y, color) {
    screenBase(x, y, 52, 34);
    ctx.fillStyle = color; ctx.globalAlpha = 0.85;
    for (var r = 0; r < 3; r++) {
      var wpx = 14 + ((r * 29 + Math.floor(t * 3)) % 22);
      ctx.fillRect(x - 20, y + 7 + r * 9, wpx, 4);
    }
    ctx.globalAlpha = 1;
  }
  function stampScreen(x, y) {
    screenBase(x, y, 52, 34);
    var on = Math.sin(t * 2.4) > 0.2;
    ctx.strokeStyle = on ? "#3ddc97" : "rgba(61,220,151,0.35)"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - 10, y + 18); ctx.lineTo(x - 2, y + 26); ctx.lineTo(x + 12, y + 8); ctx.stroke();
  }
  function barScreen(x, y, w, h) {
    screenBase(x, y, w, h);
    var n = 5;
    for (var i = 0; i < n; i++) {
      var bh = (0.3 + 0.7 * Math.abs(Math.sin(t * 1.6 + i * 1.3))) * (h - 10);
      ctx.fillStyle = i === 2 ? "#c77dff" : "rgba(199,125,255,0.55)";
      ctx.fillRect(x - w / 2 + 6 + i * ((w - 12) / n), y + h - 5 - bh, (w - 12) / n - 3, bh);
    }
  }
  function quizScreen(x, y) {
    screenBase(x, y, 52, 34);
    ctx.fillStyle = "#c77dff"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
    ctx.fillText("?", x, y + 22);
    var dots = Math.floor(t * 2) % 4;
    ctx.fillStyle = "rgba(199,125,255,0.7)"; ctx.font = "9px system-ui";
    ctx.fillText("···".slice(0, dots), x, y + 31);
  }
  function simHologram(x, y, w, h) {
    var d = DB(), a = d.assumptions || {};
    var v0 = +a.start_monthly_visitors || 500, gr = (+a.monthly_growth_pct || 15) / 100;
    var ctr = (+a.click_through_pct || 8) / 100, appr = (+a.approval_rate_pct || 5) / 100, pay = +a.avg_payout_usd || 75;
    var vals = [];
    for (var m = 0; m < 12; m++) vals.push(v0 * Math.pow(1 + gr, m) * ctr * appr * pay);
    var max = Math.max.apply(null, vals.concat([1]));
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "rgba(61,220,151,0.6)"; ctx.lineWidth = 1.5;
    rr(x, y, w, h, 5); ctx.stroke();
    for (var i = 0; i < 12; i++) {
      var bh = Math.max(2, (vals[i] / max) * (h - 12));
      ctx.fillStyle = "rgba(61,220,151," + (0.35 + 0.55 * (i / 11)) + ")";
      ctx.fillRect(x + 6 + i * ((w - 12) / 12), y + h - 6 - bh, (w - 12) / 12 - 2, bh);
    }
    ctx.fillStyle = "#3ddc97"; ctx.font = "8px system-ui"; ctx.textAlign = "left";
    ctx.fillText("SIM " + money(vals[11]) + "/mo", x + 6, y + 11);
    ctx.restore();
  }

  /* -------- Rick & Morty-style little person -------- */
  function drawPerson(p, g) {
    var feetY = g.deckY(p.fi) + g.deckH - 34;
    var x = p.x, flip = p.flip;
    var working = (p.mode === "work" || p.mode === "scan" || p.mode === "watch");
    var walking = (p.mode === "walk" || p.mode === "carry" || p.mode === "fetch");
    var sleeping = (p.mode === "sleep");
    ctx.save();
    ctx.translate(x, feetY);
    if (flip) ctx.scale(-1, 1);
    var bob = walking ? Math.abs(Math.sin(p.phase)) * 2.5 : (working ? Math.sin(t * 9 + p.phase) * 1 : Math.sin(t * 2 + p.phase) * 1);
    var hy = -52 + (sleeping ? 6 : 0) - bob * 0.4; // head center y

    // legs
    ctx.strokeStyle = "#33414f"; ctx.lineWidth = 4; ctx.lineCap = "round";
    var hipY = -24;
    if (working || p.mode === "watch") {
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(7, -8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(-2, -8); ctx.stroke();
    } else {
      var sw = walking ? Math.sin(p.phase) * 8 : 0;
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(sw, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(-sw, 0); ctx.stroke();
    }
    // body (lab coat)
    ctx.fillStyle = p.coat;
    rr(-9, -46, 18, 24, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    rr(-9, -46, 7, 24, 5); ctx.fill();
    // arms
    ctx.strokeStyle = p.skin; ctx.lineWidth = 3.5;
    if (p.carry) {
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(6, -58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-4, -56); ctx.stroke();
    } else if (working) {
      var ty = Math.sin(t * 9 + p.phase) * 2;
      ctx.beginPath(); ctx.moveTo(2, -40); ctx.lineTo(20, -34 + ty); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -40); ctx.lineTo(18, -30 - ty); ctx.stroke();
    } else {
      var asw = walking ? -Math.sin(p.phase) * 6 : Math.sin(t * 2 + p.phase) * 1.5;
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(asw, -24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-asw * 0.7, -24); ctx.stroke();
    }
    // head
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(0, hy, 11, 0, TAU); ctx.fill();
    // hair
    ctx.fillStyle = p.hair;
    if (p.hairStyle === "spiky") {
      for (var i = 0; i < 7; i++) {
        var a2 = Math.PI + (i / 6) * Math.PI; // top half
        var hx = Math.cos(a2) * 10, hyy = hy + Math.sin(a2) * 10;
        var tx2 = Math.cos(a2) * 17, ty2 = hy + Math.sin(a2) * 17 - 3;
        ctx.beginPath(); ctx.moveTo(hx - 3, hyy); ctx.lineTo(hx + 3, hyy); ctx.lineTo(tx2, ty2); ctx.closePath(); ctx.fill();
      }
    } else if (p.hairStyle === "flat") {
      ctx.beginPath(); ctx.arc(0, hy - 2, 10.5, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      ctx.fillRect(-10.5, hy - 4, 21, 4);
    } else { // tuft
      for (var j = 0; j < 4; j++) {
        var a3 = Math.PI * 1.15 + j * 0.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a3) * 8, hy + Math.sin(a3) * 8 - 2);
        ctx.lineTo(Math.cos(a3) * 15, hy + Math.sin(a3) * 15 - 5); ctx.lineTo(Math.cos(a3) * 8 + 4, hy + Math.sin(a3) * 8);
        ctx.closePath(); ctx.fill();
      }
    }
    // face
    var eo = sleeping ? 1.5 : 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-3.6, hy - 1 + eo, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.6, hy - 1 + eo, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c2733";
    if (sleeping) {
      ctx.fillRect(-6.5, hy - 1, 5.5, 1.4); ctx.fillRect(1, hy - 1, 5.5, 1.4);
    } else {
      ctx.beginPath(); ctx.arc(-3.2, hy - 1, 1.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3.9, hy - 1, 1.4, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = "#7a4a2e"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, hy + 3.5, 3.4, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.restore();

    // carried packet glow
    if (p.carry) {
      var px2 = x + (flip ? -6 : 6), py2 = feetY - 66;
      var gl = ctx.createRadialGradient(px2, py2, 1, px2, py2, 12);
      gl.addColorStop(0, p.carry.color); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px2, py2, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = p.carry.color; ctx.beginPath(); ctx.arc(px2, py2, 5, 0, TAU); ctx.fill();
    }
    // label
    ctx.fillStyle = "rgba(230,242,255,0.85)"; ctx.font = "700 9px ui-monospace,monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(p.label, x, feetY - 72);
    // sleep zzz
    if (sleeping) {
      ctx.fillStyle = "rgba(160,200,240,0.9)"; ctx.font = "10px system-ui";
      var zo = Math.sin(t * 3) * 2;
      ctx.fillText("z", x + 14, feetY - 66 + zo); ctx.fillText("Z", x + 20, feetY - 74 + zo);
    }
    // work dots
    if (p.mode === "scan") {
      ctx.fillStyle = "#4cc9f0"; ctx.font = "10px system-ui";
      ctx.fillText("scanning" + ".".repeat(1 + Math.floor(t * 2) % 3), x, feetY - 80);
    }
    p.screen = { x: x, y: feetY - 72, r: 26 };
  }

  function drawPackets() {
    for (var i = 0; i < packets.length; i++) {
      var pk = packets[i];
      if (pk.state !== "shaft") continue;
      var gl = ctx.createRadialGradient(pk.x, pk.y, 1, pk.x, pk.y, 14);
      gl.addColorStop(0, pk.color); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(pk.x, pk.y, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = pk.color; ctx.beginPath(); ctx.arc(pk.x, pk.y, 5.5, 0, TAU); ctx.fill();
    }
    for (var f = 0; f < flashes.length; f++) {
      var fl = flashes[f];
      ctx.strokeStyle = fl.color; ctx.globalAlpha = fl.life; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(fl.x, fl.y, (1 - fl.life) * 26 + 6, 0, TAU); ctx.stroke();
      if (fl.text) {
        ctx.fillStyle = fl.color; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
        ctx.fillText(fl.text, fl.x, fl.y - 12);
      }
      ctx.globalAlpha = 1;
    }
    for (var c = 0; c < coins.length; c++) {
      var cn = coins[c];
      ctx.globalAlpha = clamp(cn.life, 0, 1);
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.arc(cn.x, cn.y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#8a6d1c"; ctx.font = "700 8px system-ui"; ctx.textAlign = "center";
      ctx.fillText("$", cn.x, cn.y + 3);
      ctx.globalAlpha = 1;
    }
  }

  function drawHUD(g, s) {
    var x = 10, y = 10, w = 196;
    var cmdr = null;
    try { if (window.Missions) cmdr = window.Missions.computeCommand(DB()); } catch (e) {}
    var hh = cmdr ? 100 : 86;
    ctx.fillStyle = "rgba(5,10,18,0.72)";
    rr(x, y, w, hh, 10); ctx.fill();
    ctx.strokeStyle = "rgba(76,201,240,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#4cc9f0"; ctx.font = "800 10px system-ui";
    ctx.fillText("● MISSION CONTROL · LIVE", x + 10, y + 17);
    ctx.fillStyle = "#c8d8e8"; ctx.font = "10px system-ui";
    ctx.fillText("topics today: " + s.topics + "   briefs: " + s.briefs, x + 10, y + 34);
    ctx.fillText("products compared: " + s.products, x + 10, y + 49);
    ctx.fillStyle = s.stale ? "#ffb454" : "#3ddc97";
    ctx.fillText(s.stale ? "scouts: STANDBY (no fresh run)" : "sim run-rate: " + money(s.rate) + "/mo fake", x + 10, y + 64);
    ctx.fillStyle = "#5b7a99"; ctx.font = "9px system-ui";
    ctx.fillText("tap a crew member", x + 10, y + 79);
    if (cmdr) {
      ctx.fillStyle = "#ffd166"; ctx.font = "800 10px system-ui";
      ctx.fillText("⚔ CMDR LV." + cmdr.level + " · " + cmdr.title.toUpperCase() + " · " + cmdr.xp + " XP", x + 10, y + 93);
    }
  }

  /* ---------------- main loop ---------------- */
  function frame(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - (frame._l || ts)) / 1000);
    frame._l = ts;
    var spd = ST().speed || 1;
    if (!ST().paused) { t += dt * spd; update(dt * spd); }
    var g = geom(); geomNow = g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStars();
    drawShip(g);
    drawConsoles(g);
    var i;
    for (i = 0; i < agents.length; i++) drawPerson(agents[i], g);
    drawPackets();
    drawHUD(g, stats());
    requestAnimationFrame(frame);
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(280, r.width); H = Math.max(420, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (agents.length) {
      var g = geom();
      agents.forEach(function (p) {
        p.homeX = clamp(p.homeX, g.sx + 40, g.shaftX - 30);
        p.x = clamp(p.x, g.sx + 20, g.shaftX + 20);
      });
    }
  }

  function initStars() {
    stars = [];
    for (var i = 0; i < 110; i++) stars.push({ x: rnd(0, W), y: rnd(0, H), sz: rnd(1, 2.4), v: rnd(2, 9), tw: rnd(0, TAU), b: rnd(0.4, 1) });
  }

  function onTap(ev) {
    var r = cv.getBoundingClientRect();
    var x = (ev.clientX - r.left), y = (ev.clientY - r.top);
    var cb = CB();
    // agents first
    var best = null, bd = 1e9;
    for (var i = 0; i < agents.length; i++) {
      var s = agents[i].screen;
      if (!s) continue;
      var d = Math.hypot(s.x - x, s.y - y);
      if (d < 30 && d < bd) { bd = d; best = agents[i]; }
    }
    if (best && cb.agentSheet) { cb.agentSheet(best.meta, best.floor); return; }
    for (var j = 0; j < deckRects.length; j++) {
      var dr = deckRects[j];
      if (x >= dr.x && x <= dr.x + dr.w && y >= dr.y && y <= dr.y + dr.h && cb.floorSheet) {
        var fl = FLOORS()[dr.fi];
        if (fl) cb.floorSheet(fl);
        return;
      }
    }
  }

  window.ShipSim = {
    start: function () {
      cv = document.getElementById("ship");
      if (!cv || running) return;
      ctx = cv.getContext("2d");
      resize(); initStars(); buildCrew();
      window.addEventListener("resize", resize);
      cv.addEventListener("pointerdown", onTap);
      cv.addEventListener("pointermove", function (ev) {
        var r = cv.getBoundingClientRect();
        var x = ev.clientX - r.left, y = ev.clientY - r.top, hov = false;
        for (var i = 0; i < agents.length; i++) {
          var s = agents[i].screen;
          if (s && Math.hypot(s.x - x, s.y - y) < 30) { hov = true; break; }
        }
        cv.style.cursor = hov ? "pointer" : "default";
      });
      running = true;
      requestAnimationFrame(frame);
    },
    // debug/testing hook (not used by the page itself)
    _debug: function () { return { agents: agents, packets: packets, flashes: flashes, coins: coins }; }
  };
})();
