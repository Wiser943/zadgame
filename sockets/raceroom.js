/* Drive Race: one room. Pure logic, no sockets and no clock of its own: the caller passes `now` (ms) and an emit(to, event, payload) function,
   so the whole race can be tested without a network. `to` is a user id, or null for everyone in the room.
   Players drive their own kart on their phone and send their position about 12 times a second. The server checks it can be real,
   runs the bots, hands out the items, decides who got hit, and tells everyone where everyone is 10 times a second. */
const T = require('../public/js/racetrack.js').build();

const MAX_PLAYERS = 10;
const COLORS = ['#e5484d', '#f2b705', '#2f7fd8', '#22b573', '#8e5bd1', '#ff7a29', '#14b8c4', '#e84393', '#8d6e63', '#9aa3b2'];
const TYPES = ['danfo', 'taxi', 'keke'];
const ITEMS = ['nitro', 'shield', 'oil', 'rocket', 'goslow', 'mega'];
const POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];
const BOT_NAMES = ['Tunde', 'Chidi', 'Amaka', 'Sade', 'Kunle', 'Ngozi', 'Bola', 'Emeka', 'Zainab', 'Femi', 'Ify', 'Dayo'];
const COUNTDOWN_MS = 4600, GRACE_MS = 30000, RESULTS_MS = 20000, BOX_COOLDOWN = 7000, STATE_MS = 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const wrapDiff = (a, b) => { const L = T.L; return ((((a - b) % L) + L + L / 2) % L) - L / 2; };      // shortest signed distance between two spots on the loop

class RaceRoom {
  constructor(code, opts = {}, emit = () => {}, rand = Math.random) {
    this.code = code; this.isPublic = !!opts.isPublic; this.laps = clamp(Math.round(num(opts.laps, 3)), 1, 5); this.grid = clamp(Math.round(num(opts.grid, 8)), 2, MAX_PLAYERS);
    this.autoAt = 0;                                                   // public rooms start by themselves at this time (set by the caller)
    this.emit = emit; this.rand = rand;
    this.status = 'lobby'; this.hostId = null; this.players = []; this.hazards = []; this.rockets = []; this.nextHaz = 1; this.botSeq = 0;
    this.goAt = 0; this.startAt = 0; this.firstFinishAt = 0; this.resultsAt = 0; this.results = null; this.lastTick = 0; this.lastState = 0;
  }

  /* ---------- lobby ---------- */
  humans() { return this.players.filter((p) => !p.bot && !p.left); }
  find(id) { return this.players.find((p) => p.id === String(id)); }
  lobby() {
    return { code: this.code, host: this.hostId, public: this.isPublic, autoAt: this.autoAt || 0, now: Date.now(), laps: this.laps, grid: this.grid, status: this.status, max: MAX_PLAYERS,
      players: this.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, seat: p.seat, color: p.color, type: p.type, bot: p.bot, left: !!p.left })) };
  }
  sendLobby() { this.emit(null, 'race:lobby', this.lobby()); }
  join(user) {
    const id = String(user.id);
    const had = this.find(id);
    if (had) { had.left = false; had.ai = false; had.name = user.name || had.name; this.sendLobby(); return { ok: true, back: this.status !== 'lobby' }; }
    if (this.status !== 'lobby') return { ok: false, error: 'This race has already started.' };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, error: 'This race is full (10 players).' };
    const used = new Set(this.players.map((p) => p.seat)); let seat = 0; while (used.has(seat)) seat++;
    this.players.push(this.blank({ id, name: String(user.name || 'Player').slice(0, 20), avatar: user.avatar || '', seat, bot: false }));
    if (!this.hostId) this.hostId = id;
    this.sendLobby();
    return { ok: true };
  }
  blank(o) {
    return Object.assign({ color: COLORS[o.seat % COLORS.length], type: 'danfo', z: 0, x: 0, v: 0, lap: 1, lapIdx: 0, item: null, finished: false, finishMs: 0, place: 0, bestLapMs: 0, lastLapAt: 0,
      boxCd: {}, lastPoseAt: 0, shieldUntil: 0, spinUntil: 0, slowUntil: 0, boostUntil: 0, left: false, rowSeen: -1 }, o);
  }
  /* returns true when the room is now empty and should be deleted */
  leave(id, now = Date.now()) {
    const p = this.find(id); if (!p) return this.humans().length === 0;
    if (this.status === 'lobby' || this.status === 'results') this.players = this.players.filter((q) => q !== p);
    else { p.left = true; p.ai = true; }                                    // mid-race: the kart carries on by itself so the finishing order stays fair
    if (this.hostId === p.id) { const h = this.humans()[0]; this.hostId = h ? h.id : null; }
    if (this.humans().length === 0) return true;
    this.sendLobby();
    return false;
  }
  setStyle(id, s) { const p = this.find(id); if (!p || this.status !== 'lobby') return; if (TYPES.includes(s && s.type)) p.type = s.type; this.sendLobby(); }
  setOptions(id, o) {
    if (String(id) !== this.hostId || this.status !== 'lobby') return;
    if (o && o.laps != null) this.laps = clamp(Math.round(num(o.laps, this.laps)), 1, 5);
    if (o && o.grid != null) this.grid = clamp(Math.round(num(o.grid, this.grid)), 2, MAX_PLAYERS);
    this.sendLobby();
  }

  /* ---------- start ---------- */
  start(id, now) {
    if (String(id) !== this.hostId) return { ok: false, error: 'Only the host can start the race.' };
    if (this.status !== 'lobby') return { ok: false, error: 'The race has already started.' };
    const total = Math.max(this.grid, this.players.length, 2);
    while (this.players.length < total) {
      const used = new Set(this.players.map((p) => p.seat)); let seat = 0; while (used.has(seat)) seat++;
      const b = this.blank({ id: 'bot' + (++this.botSeq), name: BOT_NAMES[(this.botSeq - 1) % BOT_NAMES.length], avatar: '', seat, bot: true });
      b.type = TYPES[Math.floor(this.rand() * TYPES.length)]; b.skill = 0.86 + this.rand() * 0.14; b.lane = (this.rand() - .5) * 1.1; b.phase = this.rand() * 6.28; b.useAt = 0;
      this.players.push(b);
    }
    this.players.sort((a, b) => a.seat - b.seat);
    this.players.forEach((p, i) => { const row = Math.floor(i / 2); Object.assign(p, { z: -(row + 1) * 520 - (i % 2 ? 260 : 0), x: i % 2 ? .5 : -.5, v: 0, lap: 1, lapIdx: 0, item: null, finished: false, finishMs: 0, place: i + 1, bestLapMs: 0, boxCd: {}, shieldUntil: 0, spinUntil: 0, slowUntil: 0, boostUntil: 0, rowSeen: -1, lastPoseAt: 0 }); });
    this.hazards = []; this.rockets = []; this.results = null; this.firstFinishAt = 0; this.humansDoneAt = 0;
    this.status = 'countdown'; this.goAt = now + COUNTDOWN_MS; this.lastTick = now; this.lastState = 0;
    this.emit(null, 'race:countdown', { now, goAt: this.goAt, laps: this.laps, track: T.name, players: this.lobby().players, start: this.players.map((p) => [p.id, p.z, p.x]) });
    return { ok: true };
  }

  /* ---------- what a player sends ---------- */
  pose(id, m, now) {
    const p = this.find(id); if (!p || p.bot || p.ai || this.status !== 'racing' || !m) return;
    const dt = clamp((now - (p.lastPoseAt || now - 100)) / 1000, 0.02, 0.6); p.lastPoseAt = now;
    const top = T.MAXV * 1.75;
    let z = num(m.z, p.z); z = clamp(z, p.z - 250, p.z + top * dt + 300);                 // cannot teleport, cannot fly faster than a boosting kart
    p.z = z; p.x = clamp(num(m.x, 0), -3, 3); p.v = clamp(num(m.v, 0), 0, top);
    this.afterMove(p, now, true);
  }
  afterMove(p, now, human) {
    const li = Math.floor(p.z / T.L);
    if (li > p.lapIdx) { if (li >= 1) { const ms = now - (p.lastLapAt || this.startAt); if (ms > 5000 && (!p.bestLapMs || ms < p.bestLapMs)) p.bestLapMs = ms; p.lastLapAt = now; } p.lapIdx = li; }
    p.lap = clamp(li + 1, 1, this.laps);
    if (!p.finished && p.z >= this.laps * T.L) this.finish(p, now);
    // oil spills
    if (this.hazards.length && !p.finished) for (const h of this.hazards) {
      if (now < h.armAt && h.owner === p.id) continue;
      if (Math.abs(wrapDiff(p.z, h.z)) < 280 && Math.abs(p.x - h.x) < .42) { h.until = 0; this.hit(p, 'oil', now); break; }
    }
  }
  finish(p, now) {
    p.finished = true;
    const over = Math.max(0, p.z - this.laps * T.L), back = p.v > 100 ? (over / p.v) * 1000 : 0;
    p.finishMs = Math.max(1, Math.round(now - this.startAt - Math.min(back, 400)));
    if (!this.firstFinishAt) this.firstFinishAt = now;
    this.emit(null, 'race:finish', { id: p.id, ms: p.finishMs });
  }

  /* ---------- items ---------- */
  ranked() {
    return this.players.slice().sort((a, b) => (a.finished && b.finished ? a.finishMs - b.finishMs : a.finished ? -1 : b.finished ? 1 : b.z - a.z));
  }
  roll(p) {
    const order = this.ranked(), rank = order.indexOf(p), n = order.length, f = n > 1 ? rank / (n - 1) : .5;
    const w = f < .34 ? { nitro: 22, shield: 26, oil: 30, rocket: 14, goslow: 4, mega: 0 } : f < .67 ? { nitro: 22, shield: 16, oil: 18, rocket: 24, goslow: 14, mega: 6 } : { nitro: 16, shield: 8, oil: 6, rocket: 28, goslow: 22, mega: 20 };
    let r = this.rand() * ITEMS.reduce((s, k) => s + w[k], 0);
    for (const k of ITEMS) { r -= w[k]; if (r < 0) return k; }
    return 'nitro';
  }
  pickBox(id, boxId, now) {
    const p = this.find(id); if (!p || this.status !== 'racing' || p.finished) return;
    const b = T.boxes[num(boxId, -1)]; if (!b || p.item || now < (p.boxCd[b.id] || 0)) return;
    if (Math.abs(wrapDiff(p.z, b.seg * T.SEG)) > 520 || Math.abs(p.x - b.o) > .5) return;
    p.boxCd[b.id] = now + BOX_COOLDOWN; this.give(p, now);
  }
  give(p, now) {
    p.item = this.roll(p);
    if (p.bot || p.ai) p.useAt = now + 1200 + this.rand() * 3500; else this.emit(p.id, 'race:item', { item: p.item });
  }
  useItem(id, now) {
    const p = this.find(id); if (!p || !p.item || this.status !== 'racing') return;
    const item = p.item; p.item = null; if (!p.bot && !p.ai) this.emit(p.id, 'race:item', { item: null });
    if (item === 'nitro') { p.boostUntil = now + 2200; this.emit(null, 'race:fx', { kind: 'nitro', from: p.id, dur: 2200 }); }
    else if (item === 'mega') { p.boostUntil = now + 3600; p.shieldUntil = now + 3600; this.emit(null, 'race:fx', { kind: 'mega', from: p.id, dur: 3600 }); }
    else if (item === 'shield') { p.shieldUntil = now + 7000; this.emit(null, 'race:fx', { kind: 'shield', from: p.id, dur: 7000 }); }
    else if (item === 'oil') { const h = { id: this.nextHaz++, z: p.z - 500, x: p.x, owner: p.id, armAt: now + 1500, until: now + 25000 }; this.hazards.push(h); this.emit(null, 'race:fx', { kind: 'oil', from: p.id, id: h.id, z: h.z, x: h.x }); }
    else if (item === 'goslow') { this.emit(null, 'race:fx', { kind: 'goslow', from: p.id }); for (const q of this.players) if (q !== p && !q.finished && wrapDiff(q.z, p.z) > 0 && q.z > p.z) this.hit(q, 'slow', now); }
    else if (item === 'rocket') {
      const ahead = this.players.filter((q) => q !== p && !q.finished && q.z > p.z).sort((a, b) => a.z - b.z)[0];
      if (!ahead) { this.emit(null, 'race:fx', { kind: 'rocket', from: p.id, to: null, eta: 1 }); return; }
      const eta = clamp((ahead.z - p.z) / (T.MAXV * 1.5) + .8, .9, 2.6);
      this.rockets.push({ from: p.id, to: ahead.id, at: now + eta * 1000 });
      this.emit(null, 'race:fx', { kind: 'rocket', from: p.id, to: ahead.id, eta });
    }
  }
  hit(p, kind, now) {
    if (p.finished) return;
    if (p.shieldUntil > now) { p.shieldUntil = 0; this.emit(null, 'race:fx', { kind: 'block', to: p.id }); return; }
    const dur = kind === 'rocket' ? 1700 : kind === 'slow' ? 2500 : 1400;
    if (kind === 'slow') p.slowUntil = now + dur; else p.spinUntil = now + dur;
    this.emit(null, 'race:hit', { to: p.id, kind, dur });
  }

  /* ---------- the clock ---------- */
  tick(now) {
    if (this.status === 'countdown' && now >= this.goAt) {
      this.status = 'racing'; this.startAt = this.goAt; this.lastTick = now;
      this.players.forEach((p) => { p.lastLapAt = this.startAt; p.lastPoseAt = now; });
      this.emit(null, 'race:go', { now, startAt: this.startAt });
    }
    if (this.status === 'racing') {
      const dt = clamp((now - this.lastTick) / 1000, 0, 0.25); this.lastTick = now;
      for (const p of this.players) if (p.bot || p.ai) this.drive(p, dt, now);
      for (const r of this.rockets.filter((q) => q.at <= now)) { const t = this.find(r.to); if (t) this.hit(t, 'rocket', now); }
      this.rockets = this.rockets.filter((q) => q.at > now);
      this.hazards = this.hazards.filter((h) => h.until > now);
      this.ranked().forEach((p, i) => { p.place = i + 1; });
      if (now - this.lastState >= STATE_MS) { this.lastState = now; this.emit(null, 'race:state', this.stateFor(now)); }
      const hs = this.humans();
      if (hs.length && hs.every((p) => p.finished) && !this.humansDoneAt) this.humansDoneAt = now;        // once every real player is home the bots get a few seconds to finish too
      if (this.players.every((p) => p.finished) || (this.firstFinishAt && now - this.firstFinishAt > GRACE_MS) || (this.humansDoneAt && now - this.humansDoneAt > 12000)) this.end(now);
    } else if (this.status === 'results' && now >= this.resultsAt) this.reset();
  }
  flags(p, now) { return (p.boostUntil > now ? 1 : 0) | (p.spinUntil > now ? 2 : 0) | (p.shieldUntil > now ? 4 : 0) | (p.slowUntil > now ? 8 : 0) | (p.finished ? 16 : 0); }
  stateFor(now) {
    return { now, st: this.status, laps: this.laps,
      r: this.players.map((p) => [p.id, Math.round(p.z), Math.round(p.x * 100) / 100, Math.round(p.v), this.flags(p, now), p.lap, p.place]),
      h: this.hazards.map((h) => [h.id, Math.round(h.z), Math.round(h.x * 100) / 100]) };
  }

  /* ---------- bots (and a kart whose player has left) ---------- */
  drive(b, dt, now) {
    const sk = b.skill || .9, curve = Math.abs(T.curveAt(b.z)), order = this.ranked(), lead = order[0], rank = order.indexOf(b);
    let target = T.MAXV * sk * (1 - Math.min(.32, curve * .075));
    if (rank > 0 && lead && lead.z - b.z > 7000) target *= 1.06;                // the pack never gets left behind
    if (rank === 0 && order[1] && b.z - order[1].z > 6000) target *= .96;       // and a runaway leader eases off
    if (b.boostUntil > now) target *= 1.45;
    if (b.slowUntil > now) target *= .55;
    if (b.spinUntil > now) target = 0;
    if (T.at(b.z).pad !== undefined && b.boostUntil < now && now > (b.padUntil || 0)) { b.boostUntil = now + 1100; b.padUntil = now + 4000; }
    b.v += clamp(target - b.v, -T.MAXV * .9 * dt, T.MAXV * .42 * dt);
    b.z += Math.max(0, b.v) * dt;
    let aim = clamp((b.lane || 0) + Math.sin(now / 1700 + (b.phase || 0)) * .22, -.8, .8);
    for (const h of this.hazards) { const d = wrapDiff(h.z, b.z); if (d > 0 && d < 1800 && Math.abs(h.x - b.x) < .6) aim = h.x > b.x ? -.85 : .85; }
    b.x += clamp(aim - b.x, -1.5 * dt, 1.5 * dt);
    const row = Math.floor((b.z - 100 * T.SEG) / (150 * T.SEG));                // a bot "passes a box row" each time it crosses one
    if (row > b.rowSeen) { b.rowSeen = row; if (!b.item && !b.finished && this.rand() < .7) this.give(b, now); }
    if (b.item && now >= b.useAt) {
      const ahead = this.players.some((q) => q !== b && !q.finished && q.z > b.z && q.z - b.z < 4500), behind = this.players.some((q) => q !== b && !q.finished && q.z < b.z && b.z - q.z < 2600);
      const ok = b.item === 'rocket' || b.item === 'goslow' ? ahead : b.item === 'oil' ? behind : true;
      if (ok || now > b.useAt + 9000) this.useItem(b.id, now); else b.useAt = now + 800;
    }
    this.afterMove(b, now, false);
  }

  /* ---------- the end ---------- */
  end(now) {
    this.status = 'results'; this.resultsAt = now + RESULTS_MS;
    const order = this.ranked();
    this.results = { laps: this.laps, order: order.map((p, i) => ({ id: p.id, name: p.name, color: p.color, type: p.type, bot: !!p.bot, place: i + 1, timeMs: p.finished ? p.finishMs : 0, bestLapMs: p.bestLapMs || 0, points: POINTS[i] || 0, dnf: !p.finished })) };
    this.emit(null, 'race:results', this.results);
  }
  /* back to the lobby for another race: the bots go home, everyone who is still here stays */
  again(id) { if (String(id) !== this.hostId || this.status !== 'results') return; this.reset(); }
  reset() {
    this.players = this.players.filter((p) => !p.bot && !p.left);
    this.players.forEach((p) => { p.item = null; p.finished = false; p.z = 0; p.v = 0; });
    if (!this.humans().length) { this.status = 'lobby'; return; }
    if (!this.find(this.hostId)) this.hostId = this.humans()[0].id;
    this.status = 'lobby'; this.hazards = []; this.rockets = []; this.results = null;
    this.sendLobby();
  }
}

module.exports = { RaceRoom, MAX_PLAYERS, ITEMS, POINTS, COLORS, TYPES, T };
