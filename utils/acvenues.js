// Venues app rules ("Open a cinema", "Open a restaurant" ... ids 101-120). Pure functions only (no database),
// shared by routes/acvenues.js and tests/acvenues.test.js. EVERY number you may want to tune is in this file.
const crypto = require('crypto');

const HOUR_MS = 3600000, DAY_MS = 86400000;
const TAX = 0.10;                 // taken from the positive profit of a collection
const UPKEEP = 0.25;              // rent, power, wages and diesel: this share of the sales (NEPA is not free)
const MAX_HOURS = 24;             // a venue stores at most one day of income: come back every day or the rest is lost
const MAX_LEVEL = 3;
const LEVEL_MULT = [0, 1, 1.35, 1.75];         // income multiplier per level
const UPGRADE_PCT = [0, 0, 0.6, 1.0];          // price to reach level n, as a share of the opening price
const CLOSE_PCT = 0.5;            // closing a venue pays back this share of everything you put in

// peak: when the customers come (see weight()). rate: expected gross per day at level 1, as a share of the price.
const VENUES = [
  { id: 101, key: 'cinema',     name: 'Cinema',            emoji: '🎬', fa: 'film',                         color: '#7c3aed', area: 'Ikeja',            price: 18000000, rate: 0.018, peak: 'evening', blurb: 'Two screens, popcorn and the latest Nollywood premieres.' },
  { id: 102, key: 'restaurant', name: 'Restaurant',        emoji: '🍽️', fa: 'utensils',                     color: '#ea580c', area: 'Lekki',            price: 6000000,  rate: 0.017, peak: 'meal',    blurb: 'Jollof, pepper soup and a lunch crowd that never ends.' },
  { id: 103, key: 'salon',      name: 'Salon',             emoji: '💇', fa: 'scissors',                     color: '#db2777', area: 'Surulere',         price: 3500000,  rate: 0.016, peak: 'day',     blurb: 'Braids, wigs and nails. Booked solid before every weekend.' },
  { id: 104, key: 'gym',        name: 'Gym',               emoji: '🏋️', fa: 'dumbbell',                     color: '#0f766e', area: 'Victoria Island',  price: 9000000,  rate: 0.016, peak: 'gym',     blurb: 'Treadmills, weights and a 6am crowd that swears by it.' },
  { id: 105, key: 'pitch',      name: 'Football Pitch',    emoji: '⚽', fa: 'futbol',                       color: '#16a34a', area: 'Surulere',         price: 5000000,  rate: 0.020, peak: 'evening', blurb: 'Floodlit 5-a-side. Teams pay by the hour.' },
  { id: 106, key: 'gaming',     name: 'Gaming Café',       emoji: '🎮', fa: 'gamepad',                      color: '#2563eb', area: 'Yaba',             price: 4000000,  rate: 0.019, peak: 'evening', blurb: 'PS5 tournaments, FIFA queues and fast Wi-Fi.' },
  { id: 107, key: 'studio',     name: 'Recording Studio',  emoji: '🎙️', fa: 'microphone-lines',             color: '#9333ea', area: 'Yaba',             price: 8000000,  rate: 0.017, peak: 'night',   blurb: 'Afrobeats sessions that run till sunrise.' },
  { id: 108, key: 'boutique',   name: 'Fashion Boutique',  emoji: '👗', fa: 'shirt',                        color: '#e11d48', area: 'Lekki',            price: 5500000,  rate: 0.016, peak: 'day',     blurb: 'Ankara, lace and the latest owambe styles.' },
  { id: 109, key: 'supermarket',name: 'Supermarket',       emoji: '🛒', fa: 'cart-shopping',                color: '#0891b2', area: 'Ikeja',            price: 15000000, rate: 0.014, peak: 'day',     blurb: 'Rice, indomie and everything for the month.' },
  { id: 110, key: 'pharmacy',   name: 'Pharmacy',          emoji: '💊', fa: 'prescription-bottle-medical',  color: '#059669', area: 'Surulere',         price: 10000000, rate: 0.015, peak: 'day',     blurb: 'Open early, closes late, always a queue.' },
  { id: 111, key: 'clinic',     name: 'Clinic',            emoji: '🏥', fa: 'house-medical',                color: '#dc2626', area: 'Ikeja',            price: 22000000, rate: 0.015, peak: 'day',     blurb: 'Consultations, tests and a waiting room full of patients.' },
  { id: 112, key: 'school',     name: 'School',            emoji: '🏫', fa: 'school',                       color: '#d97706', area: 'Ajah',             price: 30000000, rate: 0.013, peak: 'school',  blurb: 'Fees come in during the week. Holidays are quiet.' },
  { id: 113, key: 'library',    name: 'Library',           emoji: '📚', fa: 'book-open',                    color: '#78716c', area: 'Yaba',             price: 7000000,  rate: 0.013, peak: 'day',     blurb: 'Memberships, quiet desks and exam-season crowds.' },
  { id: 114, key: 'cowork',     name: 'Coworking Space',   emoji: '💻', fa: 'laptop',                       color: '#4f46e5', area: 'Yaba',             price: 12000000, rate: 0.016, peak: 'school',  blurb: 'Hot desks, power and Wi-Fi for the startup crowd.' },
  { id: 115, key: 'nightclub',  name: 'Nightclub',         emoji: '🪩', fa: 'martini-glass-citrus',         color: '#c026d3', area: 'Lekki',            price: 25000000, rate: 0.022, peak: 'night',   blurb: 'Bottle service, DJs and queues around the block.' },
  { id: 116, key: 'gallery',    name: 'Art Gallery',       emoji: '🖼️', fa: 'palette',                      color: '#b45309', area: 'Victoria Island',  price: 9000000,  rate: 0.014, peak: 'weekend', blurb: 'Openings, tickets and the odd big sale.' },
  { id: 117, key: 'hall',       name: 'Church / Community Hall', emoji: '⛪', fa: 'church',                 color: '#0369a1', area: 'Agege',            price: 4500000,  rate: 0.015, peak: 'sunday',  blurb: 'Sunday service, naming ceremonies and hall hire.' },
  { id: 118, key: 'workshop',   name: 'Repair Workshop',   emoji: '🔧', fa: 'screwdriver-wrench',           color: '#475569', area: 'Mainland',         price: 2500000,  rate: 0.018, peak: 'day',     blurb: 'Phones, generators and fridges. Everything gets fixed.' },
  { id: 119, key: 'hotel',      name: 'Hotel',             emoji: '🏨', fa: 'hotel',                        color: '#0e7490', area: 'Victoria Island',  price: 60000000, rate: 0.012, peak: 'hotel',   blurb: 'Rooms, a bar and business travellers all week.' },
  { id: 120, key: 'wedding',    name: 'Wedding Venue',     emoji: '💒', fa: 'champagne-glasses',            color: '#be185d', area: 'Lekki',            price: 45000000, rate: 0.016, peak: 'wedding', blurb: 'Owambe every Saturday: tents, caterers and a packed hall.' }
];
const BY_KEY = new Map(VENUES.map((v) => [v.key, v]));
const venueOf = (key) => BY_KEY.get(String(key)) || null;

const PEAK_TEXT = { flat: 'Steady all day', day: 'Busy in the daytime', meal: 'Busy at lunch and dinner', evening: 'Busy in the evenings', gym: 'Busy early morning and evening', night: 'Busy at night, most on Fri and Sat',
  weekend: 'Busiest at weekends', sunday: 'Busiest on Sunday mornings', school: 'Busy on weekdays', hotel: 'Busy all week, a bit more at weekends', wedding: 'Busiest on Saturdays' };

// How busy the venue is in a given Lagos hour (0-23) and weekday (0 = Sunday). Raw numbers: weight() scales them so a week averages 1.
function raw(peak, h, d) {
  const wk = d >= 1 && d <= 5, fri = d === 5, sat = d === 6, sun = d === 0;
  switch (peak) {
    case 'day': return (h >= 8 && h < 18) ? (sun ? 0.5 : 1) : 0.1;
    case 'school': return (wk && h >= 8 && h < 17) ? 1 : 0.1;
    case 'meal': return ((h >= 12 && h < 15) || (h >= 18 && h < 22)) ? 2 : (h >= 8 && h < 23 ? 0.5 : 0.1);
    case 'evening': return (h >= 16 && h < 22) ? 2 : (h >= 10 && h < 16 ? 0.6 : 0.2) * (sat || sun ? 1.4 : 1);
    case 'gym': return ((h >= 5 && h < 9) || (h >= 17 && h < 21)) ? 2 : (h >= 9 && h < 17 ? 0.5 : 0.1);
    case 'night': return ((h >= 21 || h < 4) ? 3 : 0.1) * (fri || sat ? 1.6 : 1);
    case 'weekend': return ((sat || sun) ? 2.5 : 0.7) * (h >= 10 && h < 19 ? 1 : 0.2);
    case 'sunday': return (sun && h >= 7 && h < 14) ? 6 : (sat && h >= 10 && h < 20 ? 1.5 : 0.25);
    case 'hotel': return (sat || sun || fri ? 1.3 : 1) * (h >= 6 && h < 23 ? 1 : 0.7);
    case 'wedding': return (sat && h >= 10 && h < 23) ? 8 : ((fri || sun) && h >= 12 && h < 22 ? 1.5 : 0.15);
    default: return 1;
  }
}
const NORM = {};
for (const p of ['flat', 'day', 'school', 'meal', 'evening', 'gym', 'night', 'weekend', 'sunday', 'hotel', 'wedding']) {
  let t = 0; for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) t += raw(p, h, d); NORM[p] = t / 168;
}
const weight = (peak, h, d) => raw(peak, h, d) / (NORM[peak] || 1);

// Lagos is UTC+1 all year. A random "how was business today" factor 0.7-1.3 that is the same for the same player, venue and day.
const lagosParts = (ms) => { const t = new Date(ms + HOUR_MS); return { day: Math.floor((ms + HOUR_MS) / DAY_MS), h: t.getUTCHours(), dow: t.getUTCDay() }; };
function dayFactor(userId, key, dayNo) {
  const n = crypto.createHash('sha1').update(`${userId}|${key}|${dayNo}`).digest().readUInt16BE(0) / 65535;
  return 0.7 + n * 0.6;
}

const upgradePrice = (v, toLevel) => Math.round(v.price * (UPGRADE_PCT[toLevel] || 0));
const grossPerDay = (v, level) => v.price * v.rate * (LEVEL_MULT[level] || 0);
const netPerDay = (v, level) => Math.floor(grossPerDay(v, level) * (1 - UPKEEP) * (1 - TAX));     // expected, after upkeep and tax
const closeValue = (paid) => Math.floor((paid || 0) * CLOSE_PCT);

// What a venue has earned between `from` and `to` (ms), counting at most MAX_HOURS hours back from `to`.
// Returns { gross, upkeep, tax, net, hours }. Whole hours are counted from the first full hour after `from`.
function accrue(userId, v, level, from, to) {
  let start = Math.max(from, to - MAX_HOURS * HOUR_MS);
  const hours = Math.max(0, Math.floor((to - start) / HOUR_MS));
  let gross = 0;
  const base = grossPerDay(v, level) / 24;
  for (let i = 0; i < hours; i++) {
    const t = start + i * HOUR_MS + HOUR_MS / 2, p = lagosParts(t);
    gross += base * weight(v.peak, p.h, p.dow) * dayFactor(userId, v.key, p.day);
  }
  gross = Math.floor(gross);
  const upkeep = Math.floor(gross * UPKEEP), profit = gross - upkeep,   // costs scale with sales, so collecting at a clever moment cannot dodge them
     tax = profit > 0 ? Math.floor(profit * TAX) : 0;
  return { gross, upkeep, tax, net: profit - tax, hours, usedFrom: start };
}

module.exports = { VENUES, venueOf, PEAK_TEXT, TAX, UPKEEP, MAX_HOURS, MAX_LEVEL, LEVEL_MULT, CLOSE_PCT, HOUR_MS, weight, dayFactor, upgradePrice, grossPerDay, netPerDay, closeValue, accrue, lagosParts };
