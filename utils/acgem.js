// Daily gem hunt: admin-controlled settings (stored in ACSetting 'gemhunt'), day key, prize tiers.
const ACSetting = require('../models/ACSetting');
const HOUR = 3600000;
// Landmarks on the Lagos map the admin can choose from (names match public/allconnect/map3d.js PINS)
const PLACES = ['Naija Radio', 'Viewing Centre', 'Amala Shitta', 'CcHub', 'UNILAG', 'Boat Cruise', 'i-Fitness', 'High Court', 'The Library', 'Eko Hotels', 'Freedom Park', 'Quilox', 'Ivory Rooftop', 'Eko Casino',
  'Lagos Island', 'Victoria Island', 'Yaba Creators', 'Ikeja Business', 'Surulere Sports', 'Lekki Nightlife', 'Ajah Residential', 'Agege Market', 'Mainland Transport', 'University Campus', 'Beach Resort', 'Stadium District',
  'Convention Centre', 'Port District', 'Technology Park', 'Film Village', 'Museum Quarter', 'Government Quarter', 'Rural Outskirts', 'Offshore Island'];
const DEFAULTS = {
  enabled: true,                  // whole hunt on/off
  clueOn: true,                   // show the clue
  clue: 'Shiny new whips under bright lights on VI, where Lagos buys its dream car.',
  hintOn: false,                  // show an extra "Need a hint?" button
  hint: '',
  placeOn: true,                  // gem sparkles at the chosen landmark (off = the hunt is paused, nobody can claim)
  place: 'Victoria Island',
  prizes: { first: 50000, second: 25000, fourth: 10000, after: 3000 }   // 1st / 2nd-3rd / 4th-10th / everyone after
};
const dayKey = (now = Date.now()) => new Date(now + HOUR).toISOString().slice(0, 10);   // Lagos date (UTC+1)
const msToReset = (now = Date.now()) => { const d = new Date(now + HOUR); d.setUTCHours(24, 0, 0, 0); return d.getTime() - (now + HOUR); };
const int = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 1e8 ? n : d };
function clean(v) {
  const b = v || {}, p = b.prizes || {};
  const place = PLACES.includes(String(b.place)) ? String(b.place) : DEFAULTS.place;
  return {
    enabled: b.enabled !== false, clueOn: b.clueOn !== false, clue: String(b.clue == null ? DEFAULTS.clue : b.clue).trim().slice(0, 240),
    hintOn: !!b.hintOn, hint: String(b.hint || '').trim().slice(0, 240), placeOn: b.placeOn !== false, place,
    prizes: { first: int(p.first, DEFAULTS.prizes.first), second: int(p.second, DEFAULTS.prizes.second), fourth: int(p.fourth, DEFAULTS.prizes.fourth), after: int(p.after, DEFAULTS.prizes.after) }
  };
}
async function getConfig() { const d = await ACSetting.findById('gemhunt').lean(); return clean(Object.assign({}, DEFAULTS, d && d.value)); }
async function saveConfig(v) { const c = clean(v); await ACSetting.findByIdAndUpdate('gemhunt', { $set: { value: c } }, { upsert: true }); return c; }
const prizeFor = (rank, c) => rank === 1 ? c.prizes.first : rank <= 3 ? c.prizes.second : rank <= 10 ? c.prizes.fourth : c.prizes.after;
const active = (c) => !!(c.enabled && c.placeOn && c.place);
module.exports = { PLACES, DEFAULTS, dayKey, msToReset, getConfig, saveConfig, prizeFor, active, clean };
