// Pure single-elimination bracket logic (no I/O). Match = { a, b, winner, code }.
// bracket = { size, rounds: [[match, ...], ...] }; round 0 holds the first pairings.
function seedOrder(n) {
  if (n === 1) return [1];
  const prev = seedOrder(n / 2), out = [];
  for (const s of prev) out.push(s, n + 1 - s);
  return out;
}
const nextPow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };

// playerIds should already be shuffled/seeded by the caller. Missing slots become byes (null).
function buildBracket(playerIds) {
  const players = playerIds.map(String);
  if (players.length < 2) throw new Error('Need at least 2 players');
  const size = nextPow2(players.length);
  const order = seedOrder(size);
  const slot = (seed) => players[seed - 1] ?? null;
  const first = [];
  for (let i = 0; i < size; i += 2) first.push({ a: slot(order[i]), b: slot(order[i + 1]), winner: null, code: null });
  const rounds = [first];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({ a: null, b: null, winner: null, code: null })));
  const br = { size, rounds };
  // byes advance immediately
  first.forEach((m, k) => { if ((m.a && !m.b) || (!m.a && m.b)) setWinner(br, 0, k, m.a || m.b); });
  return br;
}

function setWinner(br, round, slot, winnerId) {
  const m = br.rounds[round]?.[slot];
  if (!m) throw new Error('No such match');
  if (m.winner) return false;                                   // already decided (idempotent)
  if (winnerId !== m.a && winnerId !== m.b) throw new Error('Winner is not in this match');
  m.winner = winnerId;
  const next = br.rounds[round + 1]?.[Math.floor(slot / 2)];
  if (next) next[slot % 2 === 0 ? 'a' : 'b'] = winnerId;
  return true;
}
// Matches that have both players and no winner yet.
function readyMatches(br) {
  const out = [];
  br.rounds.forEach((r, ri) => r.forEach((m, si) => { if (m.a && m.b && !m.winner) out.push({ round: ri, slot: si, match: m }); }));
  return out;
}
const champion = (br) => br.rounds[br.rounds.length - 1][0].winner || null;
// Runner-up = the loser of the final.
function runnerUp(br) {
  const f = br.rounds[br.rounds.length - 1][0];
  return f.winner ? (f.winner === f.a ? f.b : f.a) : null;
}
const roundName = (br, ri) => { const left = br.rounds.length - ri; return left === 1 ? 'Final' : left === 2 ? 'Semi-finals' : left === 3 ? 'Quarter-finals' : 'Round ' + (ri + 1); };
module.exports = { buildBracket, setWinner, readyMatches, champion, runnerUp, roundName, nextPow2, seedOrder };
