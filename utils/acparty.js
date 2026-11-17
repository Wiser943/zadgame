// House Party (Homes → a button on your own active home). Pure rules; routes/acparty.js does the database work.
// Scoped to what the server can actually guarantee without a live "who is standing in whose room" feed: guests
// RSVP through a server call (from a P-Gist invite or from the host's profile) instead of walking into a 3D
// room, and the "stayed 5 minutes" rule is settled once the party's clock runs out rather than tracked live.
const { dayKey } = require('./aclagos');

const COST = 20000;              // snacks & drinks, paid by the host to start
const DURATION_MS = 30 * 60000;  // 30 minutes
const MAX_GUESTS = 10;
const STAY_MS = 5 * 60000;       // a guest must have joined at least this long before the party ends to be paid
const GUEST_REWARD = 5000;
const HOST_BONUS_PER_GUEST = 3000;

function isActive(party, now = Date.now()) { return !!(party && party.endsAt && now < new Date(party.endsAt).getTime()); }

// Can this player start a party right now? `party` is user.ac.party, `hasHome` is whether they have anywhere to host it.
function canStart(party, hasHome, now = Date.now()) {
  if (!hasHome) return { ok: false, reason: 'You need a home of your own to host a party.' };
  if (isActive(party, now)) return { ok: false, reason: 'Your party is still going.' };
  if (party && party.lastDay === dayKey(now)) return { ok: false, reason: 'One party a day — come back tomorrow.' };
  return { ok: true };
}

// Can `guestId` join this host's party right now?
function canJoin(party, guestId, hostId, isFriend, now = Date.now()) {
  if (!isActive(party, now)) return { ok: false, reason: 'There is no party going on there right now.' };
  if (String(guestId) === String(hostId)) return { ok: false, reason: "You can't join your own party — your guests are already here." };
  if ((party.guests || []).some((g) => String(g.id) === String(guestId))) return { ok: false, reason: 'You are already on the guest list.' };
  if ((party.guests || []).length >= MAX_GUESTS) return { ok: false, reason: 'This party is full.' };
  if (!party.openHouse && !isFriend) return { ok: false, reason: 'This is friends-only — ask the host to open the house.' };
  return { ok: true };
}

// Settle a party that has ended and has not been paid out yet. Returns null if there is nothing to settle.
function settle(party, now = Date.now()) {
  if (!party || !party.endsAt || party.settled) return null;
  const endsAt = new Date(party.endsAt).getTime();
  if (now < endsAt) return null;
  const guests = (party.guests || []).filter((g) => endsAt - new Date(g.at).getTime() >= STAY_MS).slice(0, MAX_GUESTS);
  return { guestPayout: GUEST_REWARD, guests, hostBonus: guests.length * HOST_BONUS_PER_GUEST };
}

module.exports = { COST, DURATION_MS, MAX_GUESTS, STAY_MS, GUEST_REWARD, HOST_BONUS_PER_GUEST, isActive, canStart, canJoin, settle };
