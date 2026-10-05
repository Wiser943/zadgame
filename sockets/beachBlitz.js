const crypto = require('crypto');
const { START, nearestProgress, sample } = require('../games/beachBlitzTrack');

const rooms = new Map();
const TICK_MS = 50;
const MAX_PLAYERS = 6;
const RACE_LAPS = 3;
const MAX_SPEED = 13;
const POWERUPS = ['turbo', 'shield', 'oil', 'missile'];
const PICKUP_POINTS = [0.08, 0.21, 0.34, 0.47, 0.61, 0.75, 0.88];

function safeName(value) { return String(value || 'Racer').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 16) || 'Racer'; }
function makePlayer(id, name, color, slot) {
  return { id, name, color, slot, x: START.x + (slot % 3 - 1) * 58, y: START.y + Math.floor(slot / 3) * 46, angle: START.angle, speed: 0, lap: 0, progress: 0, input: { up: false, down: false, left: false, right: false, boost: false }, boost: 100, powerup: null, shieldUntil: 0, spinUntil: 0, finished: false, finishAt: null };
}
function makePickups() { return PICKUP_POINTS.map((t, i) => { const p = sample(t); return { id: `pickup-${i}`, x: p.x, y: p.y, type: POWERUPS[i % POWERUPS.length], active: true }; }); }
function publicPlayer(p) { return { id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, angle: p.angle, speed: p.speed, lap: p.lap, progress: p.progress, boost: p.boost, powerup: p.powerup, shield: p.shieldUntil > Date.now(), spinning: p.spinUntil > Date.now(), finished: p.finished, finishAt: p.finishAt }; }
function publicState(room) { return { room: room.code, phase: room.phase, countdown: room.countdown, tick: room.tick, laps: RACE_LAPS, pickups: room.pickups.filter(x => x.active), traps: room.traps.map(t => ({ x: t.x, y: t.y })), players: [...room.players.values()].map(publicPlayer) }; }
function broadcast(room, event = 'race:state') { room.ns.to(room.code).emit(event, publicState(room)); }
function createRoom(ns, code) { const room = { code, ns, players: new Map(), phase: 'waiting', countdown: 0, tick: 0, timer: null, startedAt: 0, pickups: makePickups(), traps: [] }; rooms.set(code, room); return room; }
function start(room) {
  if (room.phase !== 'waiting') return;
  room.phase = 'countdown'; room.countdown = 3; broadcast(room, 'race:countdown');
  const countdown = setInterval(() => { room.countdown -= 1; if (room.countdown > 0) broadcast(room, 'race:countdown'); else { clearInterval(countdown); room.phase = 'racing'; room.startedAt = Date.now(); broadcast(room); } }, 1000);
  room.timer = setInterval(() => tick(room), TICK_MS);
}
function usePowerup(room, p) {
  const item = p.powerup; if (!item || room.phase !== 'racing') return;
  p.powerup = null;
  if (item === 'turbo') { p.speed = Math.min(18, Math.max(p.speed, 11)); p.boost = Math.min(100, p.boost + 30); }
  if (item === 'shield') p.shieldUntil = Date.now() + 6500;
  if (item === 'oil') room.traps.push({ x: p.x - Math.cos(p.angle) * 35, y: p.y - Math.sin(p.angle) * 35, expires: Date.now() + 18000 });
  if (item === 'missile') { const target = [...room.players.values()].filter(x => x.id !== p.id && !x.finished && !x.shieldUntil).sort((a, b) => Math.abs(a.progress - p.progress) - Math.abs(b.progress - p.progress))[0]; if (target) { target.spinUntil = Date.now() + 1700; target.speed *= .25; } }
  broadcast(room, 'race:powerup');
}
function tick(room) {
  if (room.phase !== 'racing') return;
  room.tick += 1; const now = Date.now();
  room.traps = room.traps.filter(t => t.expires > now);
  for (const p of room.players.values()) {
    if (p.finished) continue;
    const i = p.input, spinning = p.spinUntil > now;
    const throttle = i.up ? 0.58 : i.down ? -0.38 : -0.12;
    const boost = i.boost && p.boost > 0 && p.speed > 3 && !spinning;
    const max = boost ? 18 : MAX_SPEED;
    p.speed = Math.max(-4, Math.min(max, p.speed + throttle));
    if (spinning) p.speed *= .94;
    if (boost) p.boost = Math.max(0, p.boost - 1.7); else p.boost = Math.min(100, p.boost + 0.25);
    const steer = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    p.angle += steer * 0.055 * Math.min(1, Math.abs(p.speed) / 5) * (p.speed >= 0 ? 1 : -1);
    p.x += Math.cos(p.angle) * p.speed; p.y += Math.sin(p.angle) * p.speed;
    const near = nearestProgress(p.x, p.y), prev = p.progress;
    if (near.d > 175 ** 2) p.speed *= 0.92;
    p.progress = near.t;
    if (prev > 0.82 && p.progress < 0.18) p.lap += 1;
    for (const pickup of room.pickups) if (pickup.active && Math.hypot(p.x - pickup.x, p.y - pickup.y) < 54) { pickup.active = false; p.powerup = pickup.type; }
    for (const trap of room.traps) if (Math.hypot(p.x - trap.x, p.y - trap.y) < 34 && p.shieldUntil < now) { p.spinUntil = now + 1200; p.speed *= .35; }
    if (p.lap >= RACE_LAPS) { p.finished = true; p.finishAt = now; }
  }
  broadcast(room);
  if ([...room.players.values()].every(p => p.finished)) { room.phase = 'finished'; broadcast(room, 'race:finished'); clearInterval(room.timer); room.timer = null; }
}

module.exports = function initBeachBlitz(io) {
  const ns = io.of('/beach-blitz');
  ns.use((socket, next) => { const user = socket.request.user; socket.data.userName = user?.displayName || socket.handshake.auth?.name || socket.handshake.query?.name || 'Racer'; next(); });
  ns.on('connection', socket => {
    socket.on('race:join', (payload = {}, ack = () => {}) => {
      const code = String(payload.room || 'SUNSET').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'SUNSET'; let room = rooms.get(code); if (!room) room = createRoom(ns, code);
      if (room.players.size >= MAX_PLAYERS && !room.players.has(socket.id)) return ack({ ok: false, error: 'This race is full.' });
      if (room.players.has(socket.id)) return ack({ ok: true, id: socket.id, room: code });
      const slot = room.players.size, colors = ['#ff6b4a', '#4dc7ff', '#ffd84d', '#a978ff', '#4de18f', '#ff72c8'];
      room.players.set(socket.id, makePlayer(socket.id, safeName(payload.name || socket.data.userName), colors[slot], slot)); socket.join(code); socket.data.raceRoom = code; ack({ ok: true, id: socket.id, room: code }); broadcast(room, 'race:joined'); if (room.players.size >= 2) start(room);
    });
    socket.on('race:input', (input = {}) => { const room = rooms.get(socket.data.raceRoom), p = room?.players.get(socket.id); if (!p || room.phase !== 'racing') return; p.input = { up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right, boost: !!input.boost }; });
    socket.on('race:powerup', () => { const room = rooms.get(socket.data.raceRoom), p = room?.players.get(socket.id); if (p) usePowerup(room, p); });
    socket.on('race:restart', () => { const room = rooms.get(socket.data.raceRoom); if (room?.phase === 'finished') { room.phase = 'waiting'; room.tick = 0; room.pickups = makePickups(); room.traps = []; for (const p of room.players.values()) Object.assign(p, makePlayer(p.id, p.name, p.color, p.slot)); broadcast(room); if (room.players.size >= 2) start(room); } });
    socket.on('disconnect', () => { const code = socket.data.raceRoom, room = code && rooms.get(code); if (!room) return; room.players.delete(socket.id); if (!room.players.size) { clearInterval(room.timer); rooms.delete(code); } else broadcast(room, 'race:player-left'); });
  });
};
