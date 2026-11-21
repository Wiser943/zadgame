// Invest app rules. Pure functions only (no database), shared by routes/acinvest.js and the tests.
// EVERY number you may want to tune lives in this file: prices, daily income ranges, tax, resale values.
const crypto = require('crypto');

const DAY_MS = 86400000, HOUR_MS = 3600000;
const PAYOUT_UTC_HOUR = 17;          // 18:00 in Lagos (UTC+1, no daylight saving) = 17:00 UTC
const TAX = 0.10;                    // taken from each day's positive profit before it is paid out
const MIN_HOLD_MS = 6 * HOUR_MS;     // something bought less than 6h before a payout waits for the next one
const MAX_CATCHUP_DAYS = 45;         // one settlement processes at most this many missed evenings
const MAX_LAND = 30, MAX_TRUCKS = 10;

// ---- Land: keeps its value (minus a selling fee) and grows a little every day. Growth is paid when you sell. ----
const LAND_SELL_PCT = 0.90;
const LAND = {
  epe:      { name: 'Epe',              emoji: '🌴', price: 900000,   rate: 0.0012 },
  badagry:  { name: 'Badagry',          emoji: '🌴', price: 1200000,  rate: 0.0013 },
  ikorodu:  { name: 'Ikorodu',          emoji: '🌴', price: 1500000,  rate: 0.0014 },
  ajah:     { name: 'Ajah',             emoji: '🏝️', price: 4500000,  rate: 0.0015 },
  surulere: { name: 'Surulere',         emoji: '🏘️', price: 7000000,  rate: 0.0015 },
  ikeja:    { name: 'Ikeja',            emoji: '🏘️', price: 12000000, rate: 0.0016 },
  lekki:    { name: 'Lekki',            emoji: '🏙️', price: 20000000, rate: 0.0017 },
  vi:       { name: 'Victoria Island',  emoji: '🏙️', price: 45000000, rate: 0.0018 }
};

// ---- Street businesses: one of each. They pay a random amount inside [min, max] every evening at 6:00 PM. ----
const BIZ_SELL_PCT = 0.30;
const BIZ = {
  zobo:   { name: 'Zobo & Chapman Stand', area: 'Yaba',            emoji: '🥤', price: 1500000,  min: 9000,   max: 29000,
            blurb: 'Chilled zobo for the students and the Yaba heat. Sells itself when the sun is out.' },
  pos:    { name: 'POS Stand',            area: 'Yaba',            emoji: '🏧', price: 2500000,  min: 15000,  max: 48000,
            blurb: 'Withdrawals, transfers and "network down" stories. Cash never sleeps.' },
  suya:   { name: 'Suya Spot',            area: 'Surulere',        emoji: '🍢', price: 4000000,  min: 24000,  max: 77000,
            blurb: 'Smoky, spicy, and the queue never ends after 8pm.' },
  barber: { name: 'Barbing Salon',        area: 'Lekki',           emoji: '✂️', price: 7500000,  min: 45000,  max: 145000,
            blurb: 'Fresh cuts for Lekki\'s finest. Weekends are packed.' },
  cafe:   { name: 'Cyber Café',           area: 'Ikeja',           emoji: '🖥️', price: 12000000, min: 72000,  max: 230000,
            blurb: 'Printing, passport photos and exam-portal rush every season.' },
  gym:    { name: 'Fitness Gym',          area: 'Victoria Island', emoji: '🏋️', price: 25000000, min: 150000, max: 480000,
            blurb: 'Treadmills, protein shakes and a January crowd all year round.' }
};

// ---- Haulage: buy as many trucks as you like (up to MAX_TRUCKS). Each pays daily, minus the driver, and sometimes breaks down. ----
const TRUCK = { name: 'Mack Haulage Trailer', emoji: '🚛', price: 60000000, sellOne: 6000000, min: 117000, max: 209000, driver: 30000, repair: 95000, breakdown: 0.10,
  blurb: 'Hauls containers from the port to the whole country.' };

// Two bigger businesses that open as their own mini-apps later.
const COMING = [
  { key: 'shop', emoji: '🏢', title: 'Open a shop', cost: 50000, blurb: 'Staff, prices, customers every evening.' },
  { key: 'bus',  emoji: '🚌', title: 'Eko express', cost: 0,     blurb: '1 bus between the cities. Open Bus Co. to run them.' }
];

const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const landOf = (k) => (has(LAND, k) ? LAND[k] : null);
const bizOf = (k) => (has(BIZ, k) ? BIZ[k] : null);
const bizSellValue = (k) => Math.floor(BIZ[k].price * BIZ_SELL_PCT);
const round100 = (n) => Math.round(n / 100) * 100;

// ---- time (all payout maths is on Lagos evenings) ----
const lagosDay = (ms) => new Date(ms + HOUR_MS).toISOString().slice(0, 10);               // 'YYYY-MM-DD' in Lagos
const boundaryAt = (utcMidnightMs) => utcMidnightMs + PAYOUT_UTC_HOUR * HOUR_MS;          // that day's 6 PM
const dayStart = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
// The most recent 6 PM at or before `ms`.
const lastBoundary = (ms) => { let b = boundaryAt(dayStart(ms)); if (b > ms) b -= DAY_MS; return b; };
// The next 6 PM strictly after `ms`.
const nextBoundary = (ms) => lastBoundary(ms) + DAY_MS;
// Every 6 PM in (after, upTo], oldest first, at most `cap`.
function boundariesBetween(after, upTo, cap = MAX_CATCHUP_DAYS) {
  const out = []; let b = nextBoundary(after);
  while (b <= upTo && out.length < cap) { out.push(b); b += DAY_MS; }
  return out;
}
// Deterministic "random": the same player + item + evening always gives the same number, so refreshing can't re-roll it.
const rand = (uid, key, at) => parseInt(crypto.createHash('sha1').update(`${uid}|${key}|${at}`).digest('hex').slice(0, 8), 16) / 0xffffffff;

// What does one item earn on one evening? Returns { pre (before tax), tax, net, gross, cost, broke }.
function bizDay(uid, key, at) {
  const b = BIZ[key]; const gross = round100(b.min + rand(uid, 'b:' + key, at) * (b.max - b.min));
  const tax = Math.round(gross * TAX); return { gross, cost: 0, pre: gross, tax, net: gross - tax, broke: false };
}
function truckDay(uid, id, at) {
  const gross = round100(TRUCK.min + rand(uid, 't:' + id, at) * (TRUCK.max - TRUCK.min));
  const broke = rand(uid, 'x:' + id, at) < TRUCK.breakdown, cost = TRUCK.driver + (broke ? TRUCK.repair : 0);
  const pre = gross - cost, tax = pre > 0 ? Math.round(pre * TAX) : 0;
  return { gross, cost, pre, tax, net: pre - tax, broke };
}

// Work out everything that should have been paid since `last`.  inv = { biz:[{key,at}], trucks:[{id,at}] }  (at = ms bought)
// Returns { entries:[{k,item,pre,tax,net,broke}], net, newLast, more }
function settle(uid, inv, last, now) {
  const bounds = boundariesBetween(last, now), entries = []; let net = 0;
  for (const B of bounds) {
    const k = lagosDay(B - 1);
    for (const b of inv.biz || []) if (bizOf(b.key) && B - b.at >= MIN_HOLD_MS) { const d = bizDay(uid, b.key, B); entries.push({ k, item: b.key, pre: d.pre, tax: d.tax, net: d.net, broke: false }); net += d.net; }
    for (const t of inv.trucks || []) if (B - t.at >= MIN_HOLD_MS) { const d = truckDay(uid, t.id, B); entries.push({ k, item: 'truck', pre: d.pre, tax: d.tax, net: d.net, broke: d.broke }); net += d.net; }
  }
  const newLast = bounds.length ? bounds[bounds.length - 1] : last;
  return { entries, net, newLast, more: nextBoundary(newLast) <= now };
}

// ---- values ----
const daysHeld = (at, now) => Math.max(0, Math.floor((now - at) / DAY_MS));
const landGrowth = (l, now) => { const c = landOf(l.place); return c ? Math.floor(c.price * c.rate * daysHeld(l.at, now)) : 0; };
const landGrewWeek = (l, now) => { const c = landOf(l.place); return c ? Math.floor(c.price * c.rate * Math.min(7, daysHeld(l.at, now))) : 0; };
const landWorth = (l, now) => { const c = landOf(l.place); return c ? Math.floor(c.price * LAND_SELL_PCT) + landGrowth(l, now) : 0; };

const sum = (a) => a.reduce((x, y) => x + y, 0);
// Today / this week / total for a list of ledger rows (optionally one item). "pre" = before tax.
function rollup(ledger, now, item) {
  const today = lagosDay(now), week = new Set([...Array(7).keys()].map((i) => lagosDay(now - i * DAY_MS)));
  const rows = (ledger || []).filter((e) => !item || e.item === item);
  return { today: sum(rows.filter((e) => e.k === today).map((e) => e.pre)), week: sum(rows.filter((e) => week.has(e.k)).map((e) => e.pre)),
    todayNet: sum(rows.filter((e) => e.k === today).map((e) => e.net)), weekNet: sum(rows.filter((e) => week.has(e.k)).map((e) => e.net)) };
}

module.exports = { DAY_MS, PAYOUT_UTC_HOUR, TAX, MIN_HOLD_MS, MAX_LAND, MAX_TRUCKS, LAND_SELL_PCT, BIZ_SELL_PCT, LAND, BIZ, TRUCK, COMING,
  landOf, bizOf, bizSellValue, lagosDay, lastBoundary, nextBoundary, boundariesBetween, rand, bizDay, truckDay, settle,
  daysHeld, landGrowth, landGrewWeek, landWorth, rollup };
