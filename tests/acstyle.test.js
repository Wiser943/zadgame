const test = require('node:test');
const assert = require('node:assert');
const S = require('../utils/acstyle');

const NOON_MON = Date.UTC(2026, 9, 5, 10, 0, 0);   // Mon 5 Oct 2026, 11:00 Lagos
const SAT = Date.UTC(2026, 9, 10, 10, 0, 0);

test('141 body types are all present and sensible', () => {
  assert.ok(Object.keys(S.BODIES).length >= 8);
  for (const b of Object.values(S.BODIES)) for (const k of ['h', 'sh', 'tw', 'hp', 'lw']) assert.ok(b[k] > .7 && b[k] < 1.5, b.name + ' ' + k);
});
test('142/154 hairstyles: many styles, all priced, wigs never need touch-ups sooner than 30 days', () => {
  assert.ok(S.HAIRSTYLES.length >= 20);
  assert.ok(S.HAIRSTYLES.every((h) => h.price > 0 && h.g > 0 && ['barber', 'salon'].includes(h.shop)));
  assert.ok(S.HAIRSTYLES.filter((h) => h.wig).every((h) => h.g >= 30));
});
test('143-145: traditional outfits carry a culture note, every job has a uniform, seasons are defined', () => {
  const trad = Object.values(S.ITEMS).filter((i) => i.cat === 'traditional');
  assert.ok(trad.length >= 10 && trad.every((i) => i.culture && i.note));
  const jobs = require('../utils/acjobs');
  for (const id of Object.keys(jobs.JOBS)) assert.ok(S.ITEMS['uni_' + id] && S.ITEMS['uni_' + id].job === id, 'uniform for ' + id);
  assert.ok(Object.values(S.ITEMS).some((i) => i.season));
  for (const id of Object.values(S.ITEMS).filter((i) => i.season).map((i) => i.season)) assert.ok(S.SEASONS[id], id);
});
test('seasons follow the Lagos calendar', () => {
  assert.ok(S.seasonOn('harmattan', Date.UTC(2026, 11, 20)) && !S.seasonOn('harmattan', Date.UTC(2026, 5, 20)));
  assert.ok(S.seasonOn('rainy', Date.UTC(2026, 5, 20)) && !S.seasonOn('rainy', Date.UTC(2026, 11, 20)));
  assert.ok(S.seasonOn('detty', Date.UTC(2026, 11, 25)) && S.seasonOn('detty', Date.UTC(2027, 0, 3)) && !S.seasonOn('detty', Date.UTC(2027, 0, 20)));
  assert.ok(S.seasonOn('independence', Date.UTC(2026, 9, 1)));
  const info = S.seasonInfo('harmattan', Date.UTC(2026, 9, 9));
  assert.strictEqual(info.on, false); assert.ok(info.daysUntil > 30 && info.daysUntil < 45);
  const on = S.seasonInfo('detty', Date.UTC(2026, 11, 28)); assert.ok(on.on && on.daysLeft > 5);
  const sal = S.seasonInfo('sallah', Date.UTC(2026, 9, 9)); assert.ok(typeof sal.daysUntil === 'number');
});
test('buying: seasonal items are only sold in season, owned ones are not sold twice, free ones need no purchase', () => {
  const none = new Set();
  const off = S.buyCheck('s_puffer', none, Date.UTC(2026, 5, 20)); assert.strictEqual(off.ok, false); assert.strictEqual(off.code, 403); assert.match(off.message, /Harmattan/);
  assert.strictEqual(S.buyCheck('s_puffer', none, Date.UTC(2026, 11, 20)).ok, true);
  assert.strictEqual(S.buyCheck('s_puffer', new Set(['s_puffer']), Date.UTC(2026, 11, 20)).code, 409);
  assert.strictEqual(S.buyCheck('top_tee', none).code, 409);
  assert.strictEqual(S.buyCheck('nope', none).code, 400);
  assert.strictEqual(S.buyCheck('uni_oil', none, NOON_MON, 'oil').price, S.UNI_PRICE);
});
test('wearing: you need to own it, wear it in the right slot, and it must not be worn out; uniforms are free for your job', () => {
  const ctx = { owned: new Set(['top_hoodie']), tailoredReady: new Set(['t_abc']), dura: { top_hoodie: 50, top_polo: 0 }, jobId: 'health' };
  assert.strictEqual(S.canWear('top_hoodie', ctx).ok, true);
  assert.strictEqual(S.canWear('top_blazer', ctx).ok, false);
  assert.strictEqual(S.canWear('top_tee', ctx).ok, true);
  assert.strictEqual(S.canWear('uni_health', ctx).ok, true);
  assert.strictEqual(S.canWear('uni_oil', ctx).ok, false);
  assert.strictEqual(S.canWear('t_abc', ctx).ok, true);
  assert.strictEqual(S.canWear('t_zzz', ctx).ok, false);
  assert.strictEqual(S.canWear('top_polo', Object.assign({}, ctx, { owned: new Set(['top_polo']) })).ok, false, 'worn out');
  const { look, errors } = S.cleanLook({ top: 'sn_runner', shoes: 'sn_runner', outfit: 'out_agbada', body: 'plus', skin: '#123456', hair: 'afro' }, ctx);
  assert.strictEqual(look.body, 'plus'); assert.ok(!('top' in look)); assert.ok(!('shoes' in look)); assert.ok(!('skin' in look) && !('hair' in look));
  assert.ok(errors.length >= 3);
});
test('147 dye price scales with the item and starts at 1,500', () => {
  assert.strictEqual(S.dyeCost('top_tee'), 1500); assert.ok(S.dyeCost('out_aso_oke') > 1500); assert.strictEqual(S.dyeCost('j_chain'), 0);
});
test('148 resolve: dyes, defaults and uniforms at work', () => {
  const r = S.resolve({ top: 'top_hoodie' }, { gender: 'male', dyes: { top_hoodie: { c1: '#ff0000' } } });
  assert.strictEqual(r.top.c1, '#ff0000'); assert.strictEqual(r.top.deco, 'hood');
  const work = S.resolve({}, { gender: 'male', jobId: 'oil', auto: true, now: NOON_MON });
  assert.strictEqual(work.outfit.deco, 'hivis'); assert.strictEqual(work.top, null);
  assert.strictEqual(S.resolve({}, { gender: 'male', jobId: 'oil', auto: true, now: SAT }).outfit, null, 'weekend');
  assert.strictEqual(S.resolve({}, { gender: 'male', jobId: 'oil', auto: false, now: NOON_MON }).outfit, null);
});
test('146 tailor: prices, fashion discount, rush, embroidery and the name filter', () => {
  const base = S.tailorPrice({ base: 'kaftan', fabric: 'cotton' }), lace = S.tailorPrice({ base: 'kaftan', fabric: 'lace' });
  assert.ok(lace > base); assert.ok(S.tailorPrice({ base: 'kaftan', fabric: 'cotton', label: 'Ade' }) === base + S.TAILOR.embroidery);
  assert.ok(S.tailorPrice({ base: 'kaftan', fabric: 'cotton' }, 'fashion') < base);
  assert.ok(S.tailorPrice({ base: 'kaftan', fabric: 'cotton', rush: true }) > base);
  assert.ok(S.tailorReadyMs({ fabric: 'aso_oke' }) > S.tailorReadyMs({ fabric: 'cotton' })); assert.ok(S.tailorReadyMs({ fabric: 'aso_oke', rush: true }) < 60000);
  assert.strictEqual(S.tailorPrice({ base: 'x', fabric: 'cotton' }), null);
  assert.strictEqual(S.cleanLabel('Ade <b>').ok, false); assert.strictEqual(S.cleanLabel('f u c k').ok, false); assert.deepStrictEqual(S.cleanLabel("  Tolu's  ").label, "Tolu's");
  const t = S.resolve({ outfit: 't_ab12' }, { gender: 'female', tailored: [{ id: 'ab12', base: 'agbada', fabric: 'aso_oke', fit: 'loose', c1: '#112233', c2: '#445566', label: 'Ade' }] });
  assert.strictEqual(t.outfit.k, 'agbada'); assert.strictEqual(t.outfit.pat, 'aso'); assert.strictEqual(t.outfit.label, 'Ade'); assert.strictEqual(t.outfit.fit, 1.1);
});
test('149 durability: wear is slow, repairs cost a share of the price, worn out hides as tattered first', () => {
  assert.ok(S.wearPoints(S.ITEMS.top_tee, 3600000) > 0 && S.wearPoints(S.ITEMS.j_chain, 3600000) === 0);
  const hours = 100 / S.wearPoints(S.ITEMS.top_tee, 3600000); assert.ok(hours > 40 && hours < 120, 'a T-shirt lasts ' + hours + ' worn hours');
  assert.strictEqual(S.repairCost(100000, 100), 0); assert.ok(S.repairCost(100000, 0) <= 25000 && S.repairCost(100000, 0) > S.repairCost(100000, 80)); assert.ok(S.repairCost(1000, 0) >= 500);
  assert.strictEqual(S.resolve({ top: 'top_tee' }, { gender: 'male', dura: { top_tee: 10 } }).top.tatter, true);
  assert.strictEqual(S.resolve({ top: 'top_tee' }, { gender: 'male', dura: { top_tee: 90 } }).top.tatter, false);
  const ids = S.wornIds({ outfit: 'out_agbada', shoes: 'sn_runner', head: 'c_gele' }, { gender: 'male' }); assert.deepStrictEqual(ids.sort(), ['out_agbada', 'sn_runner']);
});
test('150-152 collections: sneakers, jewellery and heritage items, milestones pay once', () => {
  assert.ok(S.setMembers('sneakers').length >= 12 && S.setMembers('jewel').length >= 14 && S.setMembers('culture').length >= 10);
  const five = S.setMembers('sneakers').slice(0, 3); const t = S.newTiers(five, []); assert.strictEqual(t.length, 1); assert.strictEqual(t[0].title, 'Sneakerhead');
  assert.strictEqual(S.newTiers(five, ['sneakers:3']).length, 0);
  const all = S.newTiers(S.setMembers('sneakers'), []); assert.ok(all.some((x) => x.key === 'sneakers:all'));
  assert.deepStrictEqual(S.titlesOf(['sneakers:3', 'jewel:6']), ['Sneakerhead', 'Bling Boss']);
  const rar = new Set(Object.values(S.ITEMS).filter((i) => i.set === 'sneakers').map((i) => i.rarity)); assert.ok(rar.has('legendary') && rar.has('common'));
});
test('153 makeup: every product has a palette and render clamps shade + strength', () => {
  const lip = Object.values(S.ITEMS).filter((i) => i.cat === 'makeup'); assert.ok(lip.length >= 7 && lip.every((i) => i.palette.length >= 3 && S.MAKEUP_SLOTS[i.slot.slice(2)]));
  const ctx = { owned: new Set(['mk_lip_matte']), tailoredReady: new Set(), dura: {} };
  const { look } = S.cleanLook({ makeup: { lips: { id: 'mk_lip_matte', c: '#000000', a: 9 }, eyes: { id: 'mk_shadow_soft', c: '#b98a6a' } } }, ctx);
  assert.strictEqual(look.makeup.lips.c, S.ITEMS.mk_lip_matte.palette[0]); assert.strictEqual(look.makeup.lips.a, 1); assert.ok(!look.makeup.eyes);
});
test('154 salon: hair gets messy after its groom days, loyalty price, touch-up cost', () => {
  const day = S.DAY, now = 100 * day;
  assert.strictEqual(S.resolve({ hair: 'fade' }, { gender: 'male', hairAt: now - 2 * day, now }).hair.messy, false);
  assert.strictEqual(S.resolve({ hair: 'fade' }, { gender: 'male', hairAt: now - 20 * day, now }).hair.messy, true);
  assert.strictEqual(S.resolve({ hair: 'bob' }, { gender: 'female', hairAt: now - 20 * day, now }).hair.messy, false, 'wigs last');
  assert.ok(S.hairPrice('fade', { visits: 4 }) < S.hairPrice('fade', { visits: 3 }));
  assert.ok(S.touchupCost('fade') < S.HAIR.fade.price && S.touchupCost('fade') >= 1500);
  assert.strictEqual(S.resolve({}, { gender: 'male', freshUntil: now + 1, now }).fresh, true);
});
test('156 moods: auto mood follows needs', () => {
  assert.strictEqual(S.autoMood([.9, .9, .9, .9, .9, .9]), 'happy'); assert.strictEqual(S.autoMood([.1, .9, .9, .9, .9, .9]), 'angry'); assert.strictEqual(S.autoMood([.9, .1, .9, .9, .9, .9]), 'sleepy');
  assert.strictEqual(S.autoMood([.9, .9, .1, .9, .9, .9]), 'sad'); assert.strictEqual(S.autoMood(null), 'neutral');
  assert.strictEqual(S.resolve({}, { gender: 'male', mood: 'sleepy' }).mood, 'sleepy'); assert.strictEqual(S.resolve({}, { gender: 'male', mood: 'nope' }).mood, 'neutral');
});
test('155/157/158: free and paid walk, idle and photo poses exist', () => {
  for (const slot of ['walk', 'idle', 'pose']) { const l = Object.values(S.ITEMS).filter((i) => i.slot === slot); assert.ok(l.length >= 8 || slot === 'pose' && l.length >= 8, slot); assert.ok(l.some((i) => i.price === 0) && l.some((i) => i.price > 0)); }
  assert.ok(S.isFree('walk_normal') && !S.isFree('walk_swagger'));
});
test('159 pronouns: presets, custom text is cleaned and filtered, text is shown right', () => {
  assert.strictEqual(S.pronounText('theythem'), 'they/them'); assert.strictEqual(S.pronounText('custom', 'xe/xem'), 'xe/xem'); assert.strictEqual(S.pronounText(''), '');
  assert.strictEqual(S.cleanCustomPronouns('  xe / xem ').value, 'xe / xem'); assert.strictEqual(S.cleanCustomPronouns('a'.repeat(40)).value.length, 20);
  assert.strictEqual(S.cleanCustomPronouns('<b>').ok, false); assert.strictEqual(S.cleanCustomPronouns('shit/shit').ok, false);
});
test('160 privacy: who can see what', () => {
  assert.strictEqual(S.canSee('everyone', 'stranger'), true); assert.strictEqual(S.canSee('friends', 'stranger'), false); assert.strictEqual(S.canSee('friends', 'friend'), true);
  assert.strictEqual(S.canSee('me', 'friend'), false); assert.strictEqual(S.canSee('me', 'self'), true);
  assert.strictEqual(S.PRIVACY_DEFAULT.pronouns, 'friends', 'pronouns are friends-only until you choose otherwise');
});
test('the default look matches the old characters, so nobody changes overnight', () => {
  const m = S.resolve({}, { gender: 'male' }), f = S.resolve({}, { gender: 'female' });
  assert.strictEqual(m.top.c1, '#d9b24a'); assert.strictEqual(m.bottom.c1, '#262833'); assert.strictEqual(m.shoes.c1, '#f2f2f2'); assert.strictEqual(m.hair.style, 'lowcut');
  assert.strictEqual(f.top.c1, '#2f9e63'); assert.strictEqual(f.bottom.c1, '#f4efe6'); assert.strictEqual(f.shoes.c1, '#7a4b2a'); assert.strictEqual(f.hair.style, 'braids_bun');
});
test('catalogue is JSON-safe and complete', () => {
  const c = S.catalog(NOON_MON); JSON.stringify(c);
  assert.ok(c.items.length > 120 && c.seasons.length === 5 && c.hair.length && c.bodies.length);
  assert.ok(c.items.every((i) => i.id && i.slot && i.name && typeof i.price === 'number'));
});
