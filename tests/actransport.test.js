const test = require('node:test'), assert = require('node:assert');
const T = require('../utils/actransport'), J = require('../utils/acjobs'), L = require('../utils/aclagos');
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const NOW = Date.UTC(2026, 9, 7, 9, 0);      // Wednesday 10:00 Lagos

test('vehicle catalogue is sane: prices, tanks and mods all line up', () => {
  for (const [k, d] of Object.entries(T.VEHICLES)) { assert.ok(d.price > 0 && d.max >= 1, k); assert.ok(d.burn === 0 || d.tank > 0, k); assert.ok(T.modsFor(k).length >= 2, k); assert.ok(T.paintPrice(k) >= 5000, k); }
  assert.equal(T.VEHICLES.bicycle.licence, false); assert.equal(T.VEHICLES.car.licence, true);
  assert.equal(T.vdef('__proto__'), null); assert.equal(T.vdef('constructor'), null);
});
test('selling returns less than the price and less for worn vehicles', () => {
  const fresh = T.sellPrice({ kind: 'car', cond: 100 }), worn = T.sellPrice({ kind: 'car', cond: 10 });
  assert.ok(fresh < T.VEHICLES.car.price && worn < fresh && worn > 0);
});
test('fuel price follows the city event', () => {
  assert.equal(T.fuelPrice({ id: 'calm' }), 950); assert.ok(T.fuelPrice({ id: 'fuel' }) > T.fuelPrice({ id: 'goslow' })); assert.equal(T.fuelCost(10, { id: 'calm' }), 9500);
  assert.equal(T.fareMult(L.EVENTS.find((e) => e.id === 'fuel')), 1.5);
});
test('service costs more the worse the condition, and never for a new vehicle', () => {
  assert.ok(T.serviceCost('car', 10) > T.serviceCost('car', 80)); assert.equal(T.serviceCost('car', 100), 2000); assert.equal(T.serviceCost('nope', 5), 0);
  assert.equal(T.condLabel(0), 'Broken down'); assert.equal(T.condLabel(100), 'Like new');
});
test('mods are capped, only fit the right vehicles and cost a share of the price', () => {
  assert.ok(T.modPrice('aircon', 'car') > T.modPrice('aircon', 'bus') * 0.2); assert.equal(T.modPrice('jackets', 'car') > 0, true);
  assert.ok(!T.modsFor('car').some((m) => m.id === 'jackets')); assert.ok(T.modsFor('boat').some((m) => m.id === 'jackets'));
  assert.equal(T.tipPct({ mods: Object.keys(T.MODS) }), T.TIP_CAP); assert.equal(T.tipPct({ mods: ['nope'] }), 0);
});
test('insurance: discount from reputation, expiry, and the cover share', () => {
  assert.ok(T.insPrice('comp', 'car', 0) > T.insPrice('third', 'car', 0)); assert.ok(T.insPrice('comp', 'car', 100) < T.insPrice('comp', 'car', 0));
  const v = { kind: 'car', insTier: 'comp', insUntil: new Date(NOW + 1000) };
  assert.equal(T.insured(v, NOW), true); assert.equal(T.insured(v, NOW + 5000), false); assert.equal(T.cover(v, NOW), 0.9); assert.equal(T.cover({ kind: 'car' }, NOW), 0);
});
test('parking lots: unique ids, real capacity, parked flag expires', () => {
  assert.equal(new Set(T.LOTS.map((l) => l.id)).size, T.LOTS.length); assert.ok(T.LOTS.every((l) => l.cap > 0 && l.hr > 0));
  assert.equal(T.parked({ park: { lot: 'yaba', until: new Date(NOW + 1000) } }, NOW), true); assert.equal(T.parked({ park: { lot: 'yaba', until: new Date(NOW - 1) } }, NOW), false); assert.equal(T.parked({ park: { lot: '', until: null } }, NOW), false);
});
test('picking a vehicle: licence, fuel, wear and the rented bicycle', () => {
  const car = (o) => ({ id: 'a', kind: 'car', cond: 100, fuel: 20, mods: [], ...o });
  assert.match(T.pickVehicle({ vehicles: [car()] }, ['car'], NOW).err, /licence/);
  const lic = { licOk: new Date(NOW) };
  assert.equal(T.pickVehicle({ ...lic, vehicles: [car()] }, ['car'], NOW).v.id, 'a');
  assert.match(T.pickVehicle({ ...lic, vehicles: [car({ fuel: 0 })] }, ['car'], NOW).err, /fuel/);
  assert.match(T.pickVehicle({ ...lic, vehicles: [car({ cond: 0 })] }, ['car'], NOW).err, /service/);
  assert.match(T.pickVehicle({ vehicles: [] }, ['boat'], NOW).err, /boat/);
  const rent = { rentUntil: new Date(NOW + 1000), vehicles: [] };
  assert.equal(T.pickVehicle(rent, ['motorcycle', 'bicycle'], NOW).rental, true); assert.ok(T.pickVehicle(rent, ['car'], NOW).err);
  assert.ok(T.pickVehicle({ rentUntil: new Date(NOW - 1), vehicles: [] }, ['bicycle'], NOW).err);
  const b = T.pickVehicle({ vehicles: [{ id: 'b', kind: 'bicycle', cond: 50, fuel: 0, mods: [] }] }, ['bicycle'], NOW); assert.equal(b.burn, 0);
});
test('incidents: bicycles are safe, a parked vehicle gets no street ticket, insurance covers crashes', () => {
  assert.equal(T.incident({ kind: 'bicycle', cond: 100 }, NOW, () => 0), null);
  const car = { kind: 'car', cond: 100, insTier: 'comp', insUntil: new Date(NOW + 1e6) };
  const crash = T.incident(car, NOW, () => 0); assert.equal(crash.type, 'crash'); assert.equal(crash.covered + crash.pay, crash.gross); assert.ok(crash.covered > crash.pay);
  assert.equal(T.incident({ kind: 'car', cond: 100 }, NOW, seq(0.5, 0.05, 0.5))?.type, 'ticket');
  assert.equal(T.incident({ kind: 'car', cond: 100, park: { lot: 'yaba', until: new Date(NOW + 1e6) } }, NOW, seq(0.5, 0.01)), null);
  assert.equal(T.incident({ kind: 'car', cond: 40 }, NOW, () => 0.04).type, 'crash');      // worn vehicles crash more often
  assert.equal(T.incident({ kind: 'car', cond: 100 }, NOW, () => 0.5), null);
});
test('routes: valid kinds, 12 hour cap, fuel and wear limit what a route earns', () => {
  assert.ok(T.ROUTES.every((r) => T.vdef(r.kind) && r.rate > 0 && r.burn > 0 && T.ROUTE_BY[r.id] === r));
  const r = T.ROUTE_BY['oshodi-yaba'], v = { kind: 'bus', cond: 100, fuel: 70, mods: [] }, noon = Date.UTC(2026, 9, 7, 9, 0);
  const a2 = T.accrue(r, v, noon - 2 * T.HOUR, noon), a40 = T.accrue(r, v, noon - 40 * T.HOUR, noon);
  assert.ok(a2.income > 0 && a2.hours === 2 && a40.hours === T.MAX_ROUTE_HOURS && a40.income > a2.income); assert.ok(a40.income < r.rate * 12 * 1.5 * 1.3);
  const dry = T.accrue(r, { ...v, fuel: 5 }, noon - 12 * T.HOUR, noon); assert.equal(dry.limited, 'fuel'); assert.equal(dry.hours, 2);
  const worn = T.accrue(r, { ...v, cond: 2 }, noon - 12 * T.HOUR, noon); assert.equal(worn.limited, 'cond');
  assert.equal(T.accrue(null, v, noon - T.HOUR, noon).income, 0); assert.equal(T.accrue(r, v, null, noon).income, 0);
  assert.ok(T.accrue(r, v, noon - 2 * T.HOUR, noon, { rep: 100 }).income > a2.income);
  assert.ok(T.accrue(r, v, noon - 2 * T.HOUR, noon, { ev: { mult: { fare: 1.5 } } }).income > a2.income);
  assert.ok(T.demand(17, 'bus') > T.demand(2, 'bus') && T.demand(7, 'van') > T.demand(2, 'van'));
});
test('a bus pays for itself in a sensible time (about 2 to 5 months of full days)', () => {
  const r = T.ROUTE_BY['oshodi-yaba'], v = { kind: 'bus', cond: 100, fuel: 70, mods: [] }, day = T.accrue(r, v, NOW - 12 * T.HOUR, NOW).income * 2;
  const days = T.VEHICLES.bus.price / day; assert.ok(days > 30 && days < 150, 'payback ' + days);
});
test('quizzes: right sizes, shuffled options, grading rejects bad input', () => {
  for (const kind of ['signs', 'licence']) {
    const q = T.buildQuiz(kind); assert.equal(q.questions.length, T.QUIZ[kind].count); assert.equal(q.answers.length, q.questions.length);
    q.questions.forEach((x, i) => { assert.equal(x.opts.length, 4); assert.equal(new Set(x.opts).size, 4); assert.ok(q.answers[i] >= 0 && q.answers[i] < 4); });
    assert.equal(T.gradeQuiz(q.answers, q.answers), q.answers.length); assert.equal(T.gradeQuiz(q.answers.map((a) => (a + 1) % 4), q.answers), 0);
    assert.equal(T.gradeQuiz([1, 2], q.answers), null); assert.equal(T.gradeQuiz(q.answers.map(() => 9), q.answers), null); assert.equal(T.gradeQuiz('x', q.answers), null);
    assert.ok(!JSON.stringify(q.questions).includes('"answers"'));
  }
  assert.equal(T.buildQuiz('nope'), null);
  assert.equal(T.signsReward(6), 9000); assert.equal(T.signsReward(3), 3000); assert.equal(T.signsReward(0), 0);
  const ids = new Set(T.SIGNS.map((s) => s.id)); assert.equal(ids.size, T.SIGNS.length); assert.ok(T.RULES.every((r) => r.opts.length === 4));
});
test('traffic lights: points, early taps and impossible timings', () => {
  const plan = T.lightPlan(); assert.equal(plan.length, 5); assert.ok(plan.every((d) => d >= 1200 && d < 3600));
  assert.equal(T.lightPoints(200), 3); assert.equal(T.lightPoints(300), 2); assert.equal(T.lightPoints(600), 1); assert.equal(T.lightPoints(900), 0);
  assert.deepEqual(T.gradeLight(plan, [200, 200, 200, 200, 200]), { points: 15, early: 0, avg: 200, valid: 5, bad: false });
  assert.equal(T.gradeLight(plan, [200, -1, 300, 300, 600]).early, 1);
  assert.equal(T.gradeLight(plan, [10, 200, 200, 200, 200]).bad, true); assert.equal(T.gradeLight(plan, [200, 200]).bad, true); assert.equal(T.gradeLight(plan, [NaN, 1, 1, 1, 1]).bad, true); assert.equal(T.gradeLight(plan, 'x').bad, true);
  assert.ok(T.lightMinElapsed(plan, [200, 200, 200, 200, 200]) >= plan.reduce((a, b) => a + b, 0));
});
test('okada: lanes always leave a free path, grading and fare', () => {
  for (let i = 0; i < 50; i++) { const p = T.okadaPlan(); assert.equal(p.rounds.length, T.OKADA.rounds); assert.ok(p.rounds.every((r) => r.length === 3 && r.some((h) => !h))); }
  const p = T.okadaPlan(); const best = p.rounds.map((r) => r.findIndex((h) => !h)), worst = p.rounds.map((r) => r.findIndex((h) => h));
  assert.equal(T.gradeOkada(p, best), T.OKADA.rounds); assert.equal(T.gradeOkada(p, worst), 0); assert.equal(T.gradeOkada(p, [0, 1]), null); assert.equal(T.gradeOkada(p, best.map(() => 7)), null);
  assert.ok(T.okadaFare(6, null, 0) > T.okadaFare(0, null, 0)); assert.ok(T.okadaFare(3, { mult: { fare: 1.5 } }, 0) > T.okadaFare(3, null, 0)); assert.ok(T.okadaFare(3, null, 10) > T.okadaFare(3, null, 0));
  assert.ok(T.OKADA.cap / T.okadaFare(6, null, 0) > 5);
});
test('traffic reports: expiry, voted-down hiding, one line per road, worst first', () => {
  const at = (m) => new Date(NOW - m * 60000), R = (road, kind, m, up = [], down = []) => ({ road, kind, at: at(m), up, down });
  const out = T.summarize([R('Ikorodu Road', 'slow', 10), R('Ikorodu Road', 'jam', 5, ['a', 'b']), R('Eko Bridge', 'accident', 100), R('Third Mainland Bridge', 'flood', 20, [], ['a', 'b', 'c']), R('Ajah Roundabout', 'clear', 2), R('Lekki-Epe Expressway', 'accident', 3)], NOW);
  assert.deepEqual(out.map((r) => r.road), ['Lekki-Epe Expressway', 'Ikorodu Road', 'Ajah Roundabout']); assert.equal(out[1].kind, 'jam');
  assert.ok(T.ROADS.length >= 10 && Object.keys(T.REPORT_KINDS).includes('clear'));
});
test('reputation tiers and perks', () => {
  assert.equal(T.tierOf(0).name, 'Learner'); assert.equal(T.tierOf(49).name, 'Reliable'); assert.equal(T.tierOf(50).name, 'Trusted'); assert.equal(T.tierOf(95).name, 'City Hero'); assert.equal(T.tierOf(95).next, null); assert.equal(T.tierOf(-5).score, 0); assert.equal(T.tierOf(500).score, 100);
  assert.equal(T.insDiscount(100), 10); assert.equal(T.insDiscount(9), 0); assert.ok(T.repMult(100) <= 1.2 + 1e-9);
});
test('new vehicles start with a partly filled tank and the quests read the transport state', () => {
  const v = T.newVehicle('car', NOW); assert.equal(v.fuel, 27); assert.equal(v.cond, 100); assert.equal(v.route.id, '');
  assert.deepEqual(T.questDone({}), { licence: false, ride: false, insure: false });
  assert.deepEqual(T.questDone({ licOk: new Date(), vehicles: [{ ...v, insTier: 'third', insUntil: new Date() }] }), { licence: true, ride: true, insure: true });
  const d = T.describe(v, NOW, { rep: 20 }); assert.equal(d.name, 'Toyota Corolla'); assert.equal(d.park, null); assert.equal(d.route, null); assert.ok(d.sell > 0);
});
test('transport careers: ladders valid, vehicles required, catalogue tells the app what is needed', () => {
  for (const id of ['taxi', 'delivery', 'boat']) { const j = J.jobOf(id); assert.ok(j.requires.every((k) => T.vdef(k)), id); assert.ok(j.needsText); }
  const cat = J.catalogue(); assert.deepEqual(cat.find((j) => j.id === 'delivery').needs, ['motorcycle', 'bicycle']); assert.equal(cat.find((j) => j.id === 'oil').needs, null);
  assert.equal(J.describe('taxi', 0).title, 'Cab Trainee'); assert.equal(J.describe('boat', 55).title, 'Boat Captain');
});
test('the three transport quests exist and the quest rewards stay small', () => {
  for (const id of ['licence', 'ride', 'insure']) assert.ok(L.QBYID[id], id);
  assert.ok(L.QUESTS.reduce((s, q) => s + q.reward, 0) < 250000);
});
