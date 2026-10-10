// Style / identity rules shared by routes/acstyle.js, the realtime roster and tests. No database access in here.
// Everything that costs ₦ is priced HERE. The client only ever sends item ids and colours.
// Render keys (k, deco, pat) are drawn by public/allconnect/avatar.js (2D map/preview) and room3d.js (3D room).
const jobs = require('./acjobs');
const profanity = require('./profanity');

/* ------------------------------------------------------------------ time / seasons (Lagos is UTC+1 all year) */
const DAY = 86400000;
const lagosParts = (ms) => { const d = new Date(ms + 3600000); return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), dow: d.getUTCDay() }; };
let HF = null;
try { HF = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric', timeZone: 'Africa/Lagos' }); } catch (e) { HF = null; }
const hijri = (ms) => { if (!HF) return null; try { const p = HF.formatToParts(new Date(ms)); return { m: +p.find((x) => x.type === 'month').value, d: +p.find((x) => x.type === 'day').value }; } catch (e) { return null; } };
const SEASONS = {
  harmattan: { name: 'Harmattan', icon: '🌫️', blurb: 'Dry, dusty, chilly mornings (mid-Nov to Feb)', test: (L) => (L.m === 11 && L.d >= 15) || L.m === 12 || L.m === 1 || (L.m === 2 && L.d <= 20) },
  rainy: { name: 'Rainy season', icon: '🌧️', blurb: 'Heavy rain and flooded streets (Apr to Oct)', test: (L) => L.m >= 4 && L.m <= 10 },
  detty: { name: 'Detty December', icon: '🎆', blurb: 'Owambe, concerts and homecoming (1 Dec to 5 Jan)', test: (L) => L.m === 12 || (L.m === 1 && L.d <= 5) },
  independence: { name: 'Independence', icon: '🇳🇬', blurb: 'Green-white-green week (20 Sep to 5 Oct)', test: (L) => (L.m === 9 && L.d >= 20) || (L.m === 10 && L.d <= 5) },
  sallah: { name: 'Sallah', icon: '🌙', blurb: 'Eid al-Fitr and Eid al-Adha weeks (dates follow the moon)', test: (L, ms) => { const h = hijri(ms); return !!h && ((h.m === 10 && h.d <= 7) || (h.m === 12 && h.d >= 9 && h.d <= 15)); } }
};
const seasonOn = (id, ms = Date.now()) => { const s = SEASONS[id]; return !!s && s.test(lagosParts(ms), ms); };
function seasonInfo(id, ms = Date.now()) {
  const s = SEASONS[id]; if (!s) return null;
  const on = seasonOn(id, ms); let days = 0;
  if (on) { while (days < 400 && seasonOn(id, ms + (days + 1) * DAY)) days++; return { id, name: s.name, icon: s.icon, blurb: s.blurb, on: true, daysLeft: days + 1, daysUntil: 0 }; }
  while (days < 400 && !seasonOn(id, ms + (days + 1) * DAY)) days++;
  return { id, name: s.name, icon: s.icon, blurb: s.blurb, on: false, daysLeft: 0, daysUntil: days + 1 };
}
const workHours = (ms = Date.now()) => { const L = lagosParts(ms); return L.dow >= 1 && L.dow <= 5 && L.h >= 8 && L.h < 17; };

/* ------------------------------------------------------------------ palettes */
const SKIN = ['#f1d3b3', '#e0b48f', '#c98e63', '#a8683f', '#8a5230', '#6b4226', '#573420', '#43281a', '#33200f', '#241509'];
const HAIR_COLORS = [['Jet black', '#16100d'], ['Dark brown', '#3a2416'], ['Chestnut', '#6b3f22'], ['Auburn', '#7a2f1d'], ['Honey', '#b98a3e'], ['Blonde', '#e0c068'], ['Silver', '#b9bcc4'], ['Pink', '#e75a9b'], ['Blue', '#3a7bd5'], ['Green', '#2f9e63'], ['Purple', '#8e5bd1'], ['Orange', '#f08a3c']];
const HAIR_HEX = HAIR_COLORS.map((c) => c[1]);
const DYE_PALETTE = [['Black', '#1d1d22'], ['White', '#f4f4f0'], ['Cream', '#f4efe6'], ['Gold', '#d9b24a'], ['Naija green', '#2f9e63'], ['Forest', '#15603a'], ['Sky', '#3a7bd5'], ['Navy', '#1f2a44'], ['Royal purple', '#6a3fb5'], ['Lilac', '#b79ae0'], ['Pink', '#e75a9b'], ['Red', '#d6455a'], ['Wine', '#7a1f3a'], ['Orange', '#f08a3c'], ['Yellow', '#f2d03b'], ['Brown', '#7a4b2a'], ['Teal', '#14a3a3'], ['Grey', '#8b8f9a']];
const hexOk = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const cleanHex = (v, d) => (hexOk(v) ? v.toLowerCase() : d);

/* ------------------------------------------------------------------ 141 body types (free: identity is never paywalled) */
// h = height, sh = shoulder width, tw = torso thickness, hp = hip width, lw = limb thickness
const BODIES = {
  average: { name: 'Average', h: 1, sh: 1, tw: 1, hp: 1, lw: 1 },
  slim: { name: 'Slim', h: 1.02, sh: .92, tw: .84, hp: .9, lw: .86 },
  lean: { name: 'Lean & tall', h: 1.08, sh: .96, tw: .88, hp: .92, lw: .9 },
  athletic: { name: 'Athletic', h: 1.03, sh: 1.12, tw: 1.02, hp: .96, lw: 1.08 },
  broad: { name: 'Broad', h: 1.04, sh: 1.2, tw: 1.18, hp: 1.04, lw: 1.14 },
  stocky: { name: 'Stocky', h: .95, sh: 1.12, tw: 1.22, hp: 1.12, lw: 1.14 },
  curvy: { name: 'Curvy', h: 1, sh: .98, tw: 1.1, hp: 1.24, lw: 1.1 },
  plus: { name: 'Plus-size', h: 1, sh: 1.12, tw: 1.38, hp: 1.3, lw: 1.22 },
  petite: { name: 'Petite', h: .9, sh: .88, tw: .86, hp: .9, lw: .86 },
  tall: { name: 'Tall', h: 1.12, sh: 1.04, tw: .98, hp: .98, lw: 1 }
};

/* ------------------------------------------------------------------ 142 + 154 hairstyles (done at the barber / salon) */
// g = days before it needs a touch-up, wig = never grows out
const H = (id, name, shop, price, g, extra) => Object.assign({ id, name, shop, price, g, wig: false }, extra || {});
const HAIRSTYLES = [
  H('lowcut', 'Low cut', 'barber', 3000, 10), H('fade', 'Fade', 'barber', 4500, 8), H('highfade', 'High-top fade', 'barber', 6000, 8),
  H('waves', '360 waves', 'barber', 6500, 9), H('flattop', 'Flat top', 'barber', 5500, 9), H('bald', 'Clean shave', 'barber', 3000, 6),
  H('afro', 'Afro', 'barber', 6000, 14), H('twists', 'Twists', 'barber', 9000, 21), H('locs', 'Locs', 'barber', 14000, 35), H('bantu', 'Bantu knots', 'salon', 8000, 14),
  H('cornrows', 'Cornrows', 'salon', 9000, 21), H('braids_bun', 'Braids & bun', 'salon', 8000, 21), H('box_braids', 'Box braids', 'salon', 18000, 35),
  H('knotless', 'Knotless braids', 'salon', 22000, 40), H('ghana', 'Ghana weaving', 'salon', 14000, 28), H('afro_puff', 'Afro puffs', 'salon', 9000, 14),
  H('twist_out', 'Twist-out', 'salon', 10000, 10), H('space_buns', 'Space buns', 'salon', 8000, 10), H('locs_long', 'Long locs', 'salon', 30000, 45),
  H('bob', 'Bob wig', 'salon', 20000, 30, { wig: true }), H('long_wig', 'Long straight wig', 'salon', 28000, 30, { wig: true }), H('curly_wig', 'Curly wig', 'salon', 26000, 30, { wig: true })
];
const HAIR = Object.fromEntries(HAIRSTYLES.map((h) => [h.id, h]));
const BEARDS = { none: ['Clean-shaven', 0], stubble: ['Stubble', 2500], short: ['Short beard', 3500], full: ['Full beard', 4500], goatee: ['Goatee', 3500], mustache: ['Moustache', 3000], lineup: ['Sharp line-up', 4000] };
const SALON = { colour: 6000, wash: 2000, spa: 12000, touchup: .4 };      // wash = quick tidy, spa = facial glow
const TOUCHUP_MIN = 1500, FRESH_MS = 3 * DAY, LOYALTY_EVERY = 5, LOYALTY_OFF = .1, CHAIR_SECONDS = 14;

/* ------------------------------------------------------------------ catalogue of things you can own */
const ITEMS = {};
let ORDER = 0;
function add(id, slot, cat, name, price, extra) {
  if (ITEMS[id]) throw new Error('duplicate style item ' + id);
  ITEMS[id] = Object.assign({ id, slot, cat, name, price, rarity: 'common', dye: 0, wear: 0, ord: ORDER++ }, extra || {});
}
const R = (k, c1, c2, o) => Object.assign({ k, c1, c2: c2 || null, pat: 'solid', deco: '' }, o || {});

/* starter wardrobe (free) */
add('top_tee', 'top', 'clothes', 'T-shirt', 0, { dye: 1, wear: 1.4, r: R('tee', '#d9b24a') });
add('bottom_trousers', 'bottom', 'clothes', 'Trousers', 0, { dye: 1, wear: 1.2, r: R('long', '#262833') });
add('bottom_skirt', 'bottom', 'clothes', 'A-line skirt', 0, { dye: 1, wear: 1.2, r: R('skirt', '#f4efe6') });
add('shoe_canvas', 'shoes', 'shoes', 'Canvas shoes', 0, { dye: 1, wear: 1.8, r: R('sneaker', '#f2f2f2', '#d8d8d8') });
const FREE = ['top_tee', 'bottom_trousers', 'bottom_skirt', 'shoe_canvas'];
const STARTER = {
  male: { top: ['#d9b24a'], bottom: ['#262833'], shoes: ['#f2f2f2'] },
  female: { top: ['#2f9e63'], bottom: ['#f4efe6'], shoes: ['#7a4b2a'] }
};

/* everyday clothes */
[
  ['top_polo', 'Polo shirt', 12000, R('tee', '#3a7bd5', null, { deco: 'collar' })], ['top_tank', 'Tank top', 8000, R('tank', '#f4f4f0')],
  ['top_crop', 'Crop top', 14000, R('tank', '#e75a9b', null, { deco: 'crop' })], ['top_hoodie', 'Hoodie', 28000, R('long', '#8b8f9a', null, { deco: 'hood' })],
  ['top_jersey', 'Naija jersey', 22000, R('tee', '#2f9e63', '#f4f4f0', { pat: 'stripe', deco: 'collar' })], ['top_denim', 'Denim jacket', 45000, R('long', '#3a5f9a', '#2b4a7c', { deco: 'lapel' })],
  ['top_blazer', 'Blazer', 90000, R('long', '#262833', '#f4f4f0', { deco: 'lapel' })], ['top_sweater', 'Knit sweater', 26000, R('long', '#b98a3e', null, { pat: 'stripe' })]
].forEach((a) => add(a[0], 'top', 'clothes', a[1], a[2], { dye: 1, wear: 1.4, r: a[3] }));
[
  ['bottom_jeans', 'Jeans', 20000, R('long', '#3a5f9a')], ['bottom_shorts', 'Shorts', 10000, R('short', '#7a5a3a')], ['bottom_pleat', 'Pleated skirt', 18000, R('skirt', '#6a3fb5', null, { deco: 'pleat' })],
  ['bottom_jogger', 'Joggers', 16000, R('long', '#4b5563', null, { deco: 'cuff' })], ['bottom_slacks', 'Tailored slacks', 30000, R('long', '#1f2a44', null, { deco: 'crease' })], ['bottom_cargo', 'Cargo trousers', 24000, R('long', '#6b6a3a', null, { deco: 'pocket' })]
].forEach((a) => add(a[0], 'bottom', 'clothes', a[1], a[2], { dye: 1, wear: 1.2, r: a[3] }));

/* 143 traditional outfits (a note says where each one comes from) */
[
  ['out_agbada', 'Agbada', 180000, R('agbada', '#f4efe6', '#d9b24a', { pat: 'solid' }), 'Yoruba', 'A wide-sleeved flowing robe worn over a buba and sokoto, common at weddings and naming ceremonies across Nigeria.'],
  ['out_buba_sokoto', 'Buba & sokoto', 95000, R('longtop', '#6a3fb5', '#d9b24a', { deco: 'trim' }), 'Yoruba', 'The classic men\'s set: a loose buba (top) with matching sokoto (trousers).'],
  ['out_iro_buba', 'Iro & buba', 110000, R('iro', '#d6455a', '#f2d03b', { pat: 'aso' }), 'Yoruba', 'Iro is the wrapper skirt and buba the loose blouse, often paired with a gele.'],
  ['out_kaftan', 'Kaftan', 70000, R('longtop', '#14a3a3', '#f4efe6', { deco: 'trim' }), 'Nigerian', 'A relaxed long tunic worn by everybody, from weekends at home to Friday prayers.'],
  ['out_ankara_dress', 'Ankara dress', 85000, R('dress', '#f08a3c', '#2f9e63', { pat: 'ankara' }), 'Nigerian', 'Bold wax-print cloth, cut into a dress and loved at every owambe.'],
  ['out_dashiki', 'Dashiki', 40000, R('dashiki', '#f2d03b', '#7a1f3a', { pat: 'dots', deco: 'trim' }), 'West African', 'A loose, colourful tunic with embroidered neckline known across West Africa.'],
  ['out_senator', 'Senator suit', 120000, R('longtop', '#1f2a44', '#d9b24a', { deco: 'senator' }), 'Nigerian', 'Plain long-sleeve top and trousers, a sharp everyday look for men in business and politics.'],
  ['out_isiagu', 'Isiagu', 150000, R('longtop', '#7a1f3a', '#d9b24a', { pat: 'dots', deco: 'trim' }), 'Igbo', 'A top with golden lion-head patterns, worn by Igbo chiefs and at traditional events.'],
  ['out_babariga', 'Babariga', 140000, R('agbada', '#f4f4f0', '#8b8f9a', { deco: 'embroidery' }), 'Hausa', 'A wide flowing gown with embroidered chest, worn over a shirt and trousers.'],
  ['out_etibo', 'Etibo', 130000, R('longtop', '#f4efe6', '#7a1f3a', { deco: 'trim' }), 'Efik & Ibibio', 'A long loose men\'s shirt worn with wrapper and walking stick at Calabar events.'],
  ['out_aso_oke', 'Aso-oke set', 260000, R('iro', '#6a3fb5', '#d9b24a', { pat: 'aso', deco: 'trim' }), 'Yoruba', 'Hand-woven cloth kept for the biggest occasions: weddings, chieftaincy and festivals.'],
  ['out_george', 'George wrapper set', 300000, R('iro', '#14a3a3', '#d9b24a', { pat: 'lace', deco: 'trim' }), 'Igbo & Delta', 'Heavy wrapper cloth with bright patterns and sequins, tied with a matching blouse.']
].forEach((a) => add(a[0], 'outfit', 'traditional', a[1], a[2], { dye: 2, wear: 1, r: a[3], culture: a[4], note: a[5], rarity: a[2] >= 250000 ? 'epic' : a[2] >= 140000 ? 'rare' : 'uncommon' }));

/* 144 work uniforms: free while you hold that job, or buy it to keep */
const UNI_PRICE = 30000;
[
  ['oil', 'Refinery coverall', R('coverall', '#f08a3c', '#f2d03b', { deco: 'hivis' })], ['tech', 'Tech hoodie & lanyard', R('long', '#1f2a44', '#3a7bd5', { deco: 'lanyard' })],
  ['banking', 'Bank shirt & tie', R('suit', '#f4f4f0', '#7a1f3a', { deco: 'tie' })], ['transport', 'Conductor vest', R('vest', '#f2d03b', '#262833', { deco: 'vest' })],
  ['fashion', 'Tailor apron', R('apron', '#f4efe6', '#d6455a', { deco: 'tape' })], ['health', 'Scrubs', R('scrubs', '#14a3a3', '#f4f4f0', { deco: 'badge' })]
].forEach((a) => add('uni_' + a[0], 'outfit', 'uniform', a[1], UNI_PRICE, { dye: 0, wear: .9, r: a[2], job: a[0], note: 'Free to wear while you work in ' + jobs.JOBS[a[0]].name + '.' }));

/* 145 seasonal fashion: buy it only while the season is on, wear it forever */
[
  ['s_puffer', 'top', 'Harmattan puffer jacket', 55000, 'harmattan', R('long', '#d9b24a', '#8b5a2b', { deco: 'puffer' }), 1],
  ['s_beanie', 'head', 'Woolly beanie', 12000, 'harmattan', R('beanie', '#d6455a', '#f4f4f0'), 1],
  ['s_scarf', 'neckwear', 'Harmattan scarf', 15000, 'harmattan', R('scarf', '#7a1f3a', '#d9b24a'), 1],
  ['s_raincoat', 'top', 'Rain jacket', 30000, 'rainy', R('long', '#f2d03b', null, { deco: 'hood' }), 1],
  ['s_umbrella', 'hand', 'Umbrella', 15000, 'rainy', R('umbrella', '#3a7bd5', '#1f2a44'), 1],
  ['s_rainboots', 'shoes', 'Rain boots', 25000, 'rainy', R('boot', '#f2d03b', '#262833'), 1],
  ['s_sequin', 'top', 'Sequin party jacket', 120000, 'detty', R('long', '#d9b24a', '#f2d03b', { pat: 'dots', deco: 'lapel' }), 1],
  ['s_detty_dress', 'outfit', 'Detty gold gown', 160000, 'detty', R('dress', '#d9b24a', '#7a1f3a', { pat: 'dots' }), 2],
  ['s_party_shades', 'face', 'Party shades', 15000, 'detty', R('shades', '#262833', '#e75a9b'), 0],
  ['s_gwg_kaftan', 'outfit', 'Green-white-green kaftan', 80000, 'independence', R('longtop', '#2f9e63', '#f4f4f0', { pat: 'stripe', deco: 'trim' }), 2],
  ['s_flag_scarf', 'neckwear', 'Flag scarf', 10000, 'independence', R('scarf', '#2f9e63', '#f4f4f0'), 0],
  ['s_sallah_gown', 'outfit', 'Sallah babariga', 160000, 'sallah', R('agbada', '#f4f4f0', '#d9b24a', { deco: 'embroidery' }), 2],
  ['s_sallah_cap', 'head', 'Embroidered Sallah cap', 30000, 'sallah', R('hausacap', '#f4f4f0', '#d9b24a'), 1]
].forEach((a) => add(a[0], a[1], 'seasonal', a[2], a[3], { season: a[4], r: a[5], dye: a[6], wear: a[1] === 'head' || a[1] === 'neckwear' || a[1] === 'hand' || a[1] === 'face' ? 0 : 1.1, rarity: 'rare' }));

/* 150 sneaker collection */
const SNEAKERS = [
  ['sn_runner', 'Lagos Runner', 30000, 'common', R('sneaker', '#f4f4f0', '#3a7bd5')], ['sn_court', 'Island Court', 45000, 'common', R('sneaker', '#f4f4f0', '#2f9e63')],
  ['sn_slides', 'Balogun Slides', 8000, 'common', R('sandal', '#262833', '#f4f4f0')], ['sn_hightop', 'Mainland High-Top', 60000, 'uncommon', R('hightop', '#d6455a', '#f4f4f0')],
  ['sn_chunky', 'Yaba Chunky', 80000, 'uncommon', R('chunky', '#f4efe6', '#8b8f9a')], ['sn_danfo', 'Danfo Yellow Low', 95000, 'uncommon', R('sneaker', '#f2d03b', '#262833')],
  ['sn_leather', 'Ikoyi Leather', 140000, 'rare', R('sneaker', '#f4efe6', '#b98a3e')], ['sn_zobo', 'Zobo Red Hi', 160000, 'rare', R('hightop', '#7a1f3a', '#f4f4f0')],
  ['sn_bridge', 'Eko Bridge Trainer', 180000, 'rare', R('chunky', '#1f2a44', '#3a7bd5')], ['sn_suede', 'Harmattan Suede', 220000, 'epic', R('sneaker', '#b98a3e', '#7a4b2a')],
  ['sn_jollof', 'Jollof Glow', 320000, 'epic', R('hightop', '#f08a3c', '#d6455a', { deco: 'glow' })], ['sn_aso', 'Aso-oke Weave Low', 420000, 'epic', R('sneaker', '#6a3fb5', '#d9b24a', { pat: 'aso' })],
  ['sn_obsidian', 'Obsidian Night', 650000, 'legendary', R('chunky', '#16100d', '#6a3fb5', { deco: 'glow' })], ['sn_golden', 'Golden Naija Edition', 900000, 'legendary', R('hightop', '#d9b24a', '#f4f4f0', { deco: 'glow' })]
];
SNEAKERS.forEach((a) => add(a[0], 'shoes', 'sneaker', a[1], a[2], { rarity: a[3], r: a[4], dye: 1, wear: 1.5, set: 'sneakers' }));
// everyday non-collection shoes
[['sh_oxford', 'Oxford shoes', 60000, R('formal', '#3a2414')], ['sh_heels', 'Block heels', 55000, R('heel', '#262833')], ['sh_sandals', 'Leather sandals', 18000, R('sandal', '#7a4b2a')], ['sh_workboots', 'Work boots', 40000, R('boot', '#7a4b2a', '#262833')]]
  .forEach((a) => add(a[0], 'shoes', 'shoes', a[1], a[2], { r: a[3], dye: 1, wear: 1.6 }));

/* 151 jewellery collection */
const J = (id, slot, name, price, rarity, r) => add(id, slot, 'jewel', name, price, { rarity, r, set: 'jewel', dye: 0 });
J('j_chain', 'j_neck', 'Gold chain', 60000, 'uncommon', R('chain', '#d9b24a')); J('j_pendant', 'j_neck', 'Pendant necklace', 90000, 'rare', R('pendant', '#d9b24a', '#d6455a'));
J('j_pearl', 'j_neck', 'Pearl necklace', 150000, 'rare', R('pearls', '#f4f4f0')); J('j_choker', 'j_neck', 'Velvet choker', 20000, 'common', R('choker', '#262833'));
J('j_studs', 'j_ear', 'Silver studs', 25000, 'common', R('studs', '#d6d9e0')); J('j_hoops', 'j_ear', 'Gold hoops', 70000, 'uncommon', R('hoops', '#d9b24a'));
J('j_drops', 'j_ear', 'Drop earrings', 120000, 'rare', R('drops', '#d9b24a', '#2f9e63')); J('j_diamond', 'j_ear', 'Diamond studs', 600000, 'legendary', R('studs', '#e9f6ff', '#b8e0ff'));
J('j_bangle', 'j_wrist', 'Gold bangle', 80000, 'uncommon', R('bangle', '#d9b24a')); J('j_beadband', 'j_wrist', 'Bead bracelet', 15000, 'common', R('beads', '#d6455a', '#f2d03b'));
J('j_watch', 'j_wrist', 'Classic watch', 250000, 'epic', R('watch', '#8b8f9a', '#1f2a44')); J('j_smartwatch', 'j_wrist', 'Smart watch', 180000, 'rare', R('watch', '#262833', '#3a7bd5'));
J('j_ring', 'j_ring', 'Gold ring', 45000, 'common', R('ring', '#d9b24a')); J('j_signet', 'j_ring', 'Signet ring', 200000, 'epic', R('ring', '#d9b24a', '#7a1f3a'));
J('j_waist', 'j_waist', 'Waist beads (jigida)', 30000, 'uncommon', R('waistbeads', '#f2d03b', '#d6455a')); J('j_anklet', 'j_ankle', 'Silver anklet', 35000, 'common', R('anklet', '#d6d9e0'));

/* 152 wearable cultural items */
const CU = (id, slot, name, price, rarity, r, people, note, dye) => add(id, slot, 'culture', name, price, { rarity, r, culture: people, note, set: 'culture', dye: dye || 0 });
CU('c_gele', 'head', 'Gele headwrap', 35000, 'uncommon', R('gele', '#d6455a', '#f2d03b', { pat: 'aso' }), 'Yoruba', 'A sculpted head wrap, folded and tied for weddings and parties. Now worn across Nigeria.', 2);
CU('c_fila', 'head', 'Fila cap', 20000, 'common', R('fila', '#6a3fb5', '#d9b24a'), 'Yoruba', 'A soft cap tied or tipped to one side. The "abeti-aja" style has ears that fold down like a dog\'s.', 2);
CU('c_red_cap', 'head', 'Red chief\'s cap', 55000, 'rare', R('redcap', '#c1272d', '#f4f4f0'), 'Igbo', 'A red cap worn by titled men and traditional rulers in Igbo communities.', 0);
CU('c_hausa_cap', 'head', 'Hausa cap', 25000, 'common', R('hausacap', '#f4f4f0', '#8b8f9a'), 'Hausa', 'A woven or embroidered cap worn with babariga and other northern outfits.', 2);
CU('c_coral', 'neckwear', 'Coral beads', 250000, 'epic', R('coral', '#d6452d', '#f4f4f0'), 'Edo & Yoruba', 'Coral beads are worn by kings, chiefs and brides as a mark of rank and heritage.', 0);
CU('c_adire_scarf', 'neckwear', 'Adire scarf', 18000, 'common', R('scarf', '#1f2a44', '#f4f4f0', { pat: 'adire' }), 'Yoruba', 'Adire is indigo-dyed cloth patterned by tying, stitching or starch resist.', 2);
CU('c_aso_scarf', 'neckwear', 'Aso-oke stole', 30000, 'uncommon', R('scarf', '#6a3fb5', '#d9b24a', { pat: 'aso' }), 'Yoruba', 'A narrow strip of hand-woven aso-oke, worn over the shoulder.', 2);
CU('c_abebe', 'hand', 'Abebe hand fan', 15000, 'common', R('fan', '#d9b24a', '#d6455a'), 'Yoruba', 'A decorated hand fan used at festivals and by dancers.', 0);
CU('c_staff', 'hand', 'Walking staff', 40000, 'uncommon', R('staff', '#7a4b2a', '#d9b24a'), 'Nigerian', 'An elder\'s or chief\'s walking staff, carried with pride at ceremonies.', 0);
CU('c_ankara_bag', 'hand', 'Ankara clutch', 22000, 'common', R('clutch', '#f08a3c', '#2f9e63', { pat: 'ankara' }), 'Nigerian', 'Wax-print fabric made into a small bag to match your outfit.', 2);
CU('c_bead_crown', 'head', 'Beaded crown', 400000, 'legendary', R('crown', '#d6452d', '#d9b24a'), 'Yoruba', 'A beaded crown with a veil, worn by Yoruba kings (Oba). A big symbol of heritage.', 0);
CU('c_headtie', 'head', 'Ankara headtie', 12000, 'common', R('headtie', '#2f9e63', '#f2d03b', { pat: 'ankara' }), 'Nigerian', 'A simple tied cloth for everyday wear and market days.', 2);
add('sh_face_specs', 'face', 'clothes', 'Round specs', 20000, { r: R('specs', '#262833') });
add('sh_face_shades', 'face', 'clothes', 'Sunglasses', 15000, { r: R('shades', '#262833', '#3a7bd5') });
add('sh_cap', 'head', 'clothes', 'Baseball cap', 10000, { dye: 1, r: R('cap', '#1f2a44', '#f4f4f0') });
add('sh_bucket', 'head', 'clothes', 'Bucket hat', 12000, { dye: 1, r: R('bucket', '#6b6a3a') });

/* 153 makeup (one product unlocks every shade in its palette) */
const MK = (id, slot, name, price, palette, extra) => add(id, slot, 'makeup', name, price, Object.assign({ palette, rarity: 'common' }, extra || {}));
MK('mk_lip_matte', 'm_lips', 'Matte lipstick', 3000, ['#9c2f3f', '#c1272d', '#d6455a', '#7a1f3a', '#b45a8a', '#5a2a2a', '#e08a6a']);
MK('mk_lip_gloss', 'm_lips', 'Lip gloss', 2500, ['#f2a3b5', '#f08a6a', '#e75a9b', '#d9a066', '#f4d3c4']);
MK('mk_shadow_soft', 'm_eyes', 'Soft eyeshadow', 4000, ['#b98a6a', '#d9a066', '#8b6a5a', '#c9a0a0', '#6a5a7a']);
MK('mk_shadow_bold', 'm_eyes', 'Bold eyeshadow', 6000, ['#2f9e63', '#3a7bd5', '#6a3fb5', '#d9b24a', '#e75a9b', '#14a3a3']);
MK('mk_blush', 'm_cheeks', 'Blush', 3500, ['#e75a9b', '#d6455a', '#f08a6a', '#b45a8a']);
MK('mk_liner', 'm_liner', 'Winged liner', 4500, ['#16100d', '#3a2414', '#1f2a44', '#2f6f5a']);
MK('mk_glow', 'm_glow', 'Highlighter glow', 5000, ['#f2d03b', '#f4efe6', '#f2a3b5', '#d9b24a']);
MK('mk_gems', 'm_glow', 'Face gems', 8000, ['#d9b24a', '#e9f6ff', '#e75a9b', '#2f9e63'], { season: 'detty', rarity: 'rare' });

/* 157/158/155 personal motion: walk styles, idle animations, photo poses */
const MO = (id, slot, name, price, note) => add(id, slot, 'motion', name, price, { note: note || '' });
MO('walk_normal', 'walk', 'Normal walk', 0, 'Default'); MO('walk_swagger', 'walk', 'Swagger', 12000, 'Relaxed, side to side'); MO('walk_bouncy', 'walk', 'Bouncy', 8000, 'Springy steps');
MO('walk_catwalk', 'walk', 'Catwalk', 25000, 'Long, crossed strides'); MO('walk_brisk', 'walk', 'Brisk', 6000, 'Arms pumping, on a mission'); MO('walk_relaxed', 'walk', 'Easy stroll', 6000, 'Slow and loose');
MO('walk_tiptoe', 'walk', 'Tiptoe', 10000, 'Light on your feet'); MO('walk_proud', 'walk', 'Proud', 14000, 'Chest out, head high');
MO('idle_breathe', 'idle', 'Breathing', 0, 'Default'); MO('idle_hips', 'idle', 'Hands on hips', 6000); MO('idle_arms', 'idle', 'Arms crossed', 6000); MO('idle_sway', 'idle', 'Gentle sway', 5000);
MO('idle_look', 'idle', 'Look around', 7000); MO('idle_stretch', 'idle', 'Stretch', 5000); MO('idle_tap', 'idle', 'Foot tap', 8000); MO('idle_phone', 'idle', 'Check phone', 9000); MO('idle_think', 'idle', 'Thinking', 6000);
MO('pose_hips', 'pose', 'Hands on hips', 0); MO('pose_peace', 'pose', 'Peace sign', 0); MO('pose_cross', 'pose', 'Arms crossed', 0); MO('pose_hello', 'pose', 'Big hello', 0);
MO('pose_flex', 'pose', 'Flex', 5000); MO('pose_model', 'pose', 'Model', 7000); MO('pose_think', 'pose', 'Thinker', 5000); MO('pose_salute', 'pose', 'Salute', 5000);
MO('pose_selfie', 'pose', 'Selfie', 6000); MO('pose_victory', 'pose', 'Victory', 6000); MO('pose_lean', 'pose', 'Cool lean', 7000);

const SLOTS_EQUIP = ['top', 'bottom', 'outfit', 'shoes', 'head', 'neckwear', 'hand', 'face'];
const JEWEL_SLOTS = { neck: 'j_neck', ear: 'j_ear', wrist: 'j_wrist', ring: 'j_ring', waist: 'j_waist', ankle: 'j_ankle' };
const MAKEUP_SLOTS = { lips: 'm_lips', eyes: 'm_eyes', cheeks: 'm_cheeks', liner: 'm_liner', glow: 'm_glow' };
const WEARS = ['top', 'bottom', 'outfit', 'shoes'];       // slots that wear out
const isFree = (id) => !!ITEMS[id] && ITEMS[id].price === 0 && !ITEMS[id].season && !ITEMS[id].job;

/* 156 moods */
const MOODS = { neutral: 'Neutral', happy: 'Happy', excited: 'Excited', calm: 'Calm', cool: 'Cool', shy: 'Shy', sleepy: 'Sleepy', sad: 'Sad', angry: 'Angry', stressed: 'Stressed' };
// needs order in the game: [hunger, energy, fun, social, hygiene, bladder] (0..1)
function autoMood(needs) {
  if (!Array.isArray(needs) || needs.length < 6) return 'neutral';
  const n = needs.map((v) => (typeof v === 'number' ? v : .9));
  if (n[0] < .2) return 'angry'; if (n[1] < .2) return 'sleepy'; if (n[2] < .2) return 'sad'; if (n[3] < .2) return 'sad';
  if (n[4] < .2 || n[5] < .15) return 'stressed';
  const avg = n.reduce((a, b) => a + b, 0) / n.length;
  return avg > .8 ? 'happy' : avg > .6 ? 'calm' : 'neutral';
}

/* 146 tailor-made clothing */
const TAILOR = {
  bases: {
    agbada: { name: 'Agbada', price: 90000, k: 'agbada' }, buba_sokoto: { name: 'Buba & sokoto', price: 55000, k: 'longtop' }, kaftan: { name: 'Kaftan', price: 40000, k: 'longtop' },
    iro_buba: { name: 'Iro & buba', price: 60000, k: 'iro' }, dress: { name: 'Dress', price: 50000, k: 'dress' }, senator: { name: 'Senator suit', price: 65000, k: 'longtop', deco: 'senator' },
    jumpsuit: { name: 'Jumpsuit', price: 45000, k: 'coverall' }, shirt_set: { name: 'Shirt & trousers set', price: 35000, k: 'dashiki' }
  },
  fabrics: {
    cotton: { name: 'Cotton', mult: 1, pat: 'solid', wear: 1.4, mins: 3 }, linen: { name: 'Linen', mult: 1.1, pat: 'solid', wear: 1.7, mins: 4 },
    ankara: { name: 'Ankara wax print', mult: 1.2, pat: 'ankara', wear: 1.5, mins: 5 }, adire: { name: 'Adire', mult: 1.3, pat: 'adire', wear: 1.5, mins: 6 },
    damask: { name: 'Damask', mult: 1.5, pat: 'stripe', wear: 1.2, mins: 8 }, lace: { name: 'Lace', mult: 1.6, pat: 'lace', wear: 1.8, mins: 8 },
    velvet: { name: 'Velvet', mult: 1.8, pat: 'solid', wear: 1.2, mins: 10 }, aso_oke: { name: 'Aso-oke', mult: 2.2, pat: 'aso', wear: .8, mins: 15 }
  },
  fits: { slim: .93, regular: 1, loose: 1.1 },
  embroidery: 15000, rush: .6, maxPieces: 12, maxPending: 3, fashionDiscount: .2, labelMax: 14
};
const tailorPrice = (o, jobId) => {
  const b = TAILOR.bases[o.base], f = TAILOR.fabrics[o.fabric]; if (!b || !f) return null;
  let p = Math.round(b.price * f.mult / 500) * 500 + (o.label ? TAILOR.embroidery : 0);
  if (jobId === 'fashion') p = Math.round(p * (1 - TAILOR.fashionDiscount) / 500) * 500;
  return o.rush ? Math.round(p * (1 + TAILOR.rush) / 500) * 500 : p;
};
const tailorReadyMs = (o) => (o.rush ? 30000 : TAILOR.fabrics[o.fabric].mins * 60000);
function cleanLabel(v) {
  const s = String(v || '').replace(/\s+/g, ' ').trim().slice(0, TAILOR.labelMax);
  if (!s) return { ok: true, label: '' };
  if (!/^[A-Za-z0-9 .'\-]+$/.test(s)) return { ok: false, message: 'Embroidery can only use letters, numbers, spaces and . \' -' };
  if (profanity.isDirty(s)) return { ok: false, message: 'Please pick a different embroidery name.' };
  return { ok: true, label: s };
}
const tailoredRender = (t, fitName) => {
  const b = TAILOR.bases[t.base], f = TAILOR.fabrics[t.fabric];
  return R(b.k, t.c1, t.c2, { pat: f.pat, deco: b.deco || 'trim', fit: TAILOR.fits[t.fit] || 1, label: t.label || '' });
};

/* 149 durability */
const WEAR_PER_HOUR = 1.6;              // base points per worn hour; item.wear multiplies it
const DURA_MAX = 100, TATTER_AT = 20, WEAR_CREDIT_MS = 6 * 60000, WEAR_MIN_GAP_MS = 4 * 60000, WEAR_DAY_CAP_MS = 10 * 3600000;
const repairCost = (price, dura) => (dura >= DURA_MAX ? 0 : Math.max(500, Math.round(price * .25 * (DURA_MAX - dura) / DURA_MAX / 100) * 100));
const wearPoints = (item, ms) => (item && item.wear ? WEAR_PER_HOUR * item.wear * ms / 3600000 : 0);

/* 150-152 collections */
const SETS = {
  sneakers: { name: 'Sneaker collection', icon: '👟', tiers: [[3, 15000, 'Sneakerhead'], [6, 40000, 'Sole Collector'], [10, 100000, 'Sneaker Curator'], ['all', 300000, 'Grail Hunter']] },
  jewel: { name: 'Jewellery collection', icon: '💎', tiers: [[3, 15000, 'Shiny Starter'], [6, 40000, 'Bling Boss'], [10, 100000, "Jeweller's Muse"], ['all', 300000, 'Crown Jewel']] },
  culture: { name: 'Heritage collection', icon: '🪘', tiers: [[3, 15000, 'Culture Keeper'], [6, 40000, 'Heritage Holder'], ['all', 250000, 'Custodian of Culture']] }
};
const setMembers = (set) => Object.values(ITEMS).filter((i) => i.set === set).map((i) => i.id);
const tierNeed = (set, t) => (t[0] === 'all' ? setMembers(set).length : t[0]);
const tierKey = (set, t) => set + ':' + t[0];
function collectionOf(owned) {
  const have = new Set(owned || []), out = {};
  for (const set of Object.keys(SETS)) {
    const mem = setMembers(set), got = mem.filter((id) => have.has(id)).length;
    out[set] = { name: SETS[set].name, icon: SETS[set].icon, owned: got, total: mem.length, tiers: SETS[set].tiers.map((t) => ({ key: tierKey(set, t), need: tierNeed(set, t), reward: t[1], title: t[2] })) };
  }
  return out;
}
// Tiers newly reached by `owned` that are not in `claimed` yet.
function newTiers(owned, claimed) {
  const c = collectionOf(owned), done = new Set(claimed || []), out = [];
  for (const set of Object.keys(SETS)) for (const t of c[set].tiers) if (c[set].owned >= t.need && !done.has(t.key)) out.push(t);
  return out;
}
const titlesOf = (claimed) => { const out = []; for (const set of Object.keys(SETS)) for (const t of SETS[set].tiers) if ((claimed || []).includes(tierKey(set, t))) out.push(t[2]); return out; };

/* 155 pronouns, 159 accessibility, 160 privacy */
const PRONOUNS = { '': 'Not set', hehim: 'he/him', sheher: 'she/her', theythem: 'they/them', hethey: 'he/they', shethey: 'she/they', any: 'any pronouns', ask: 'ask me', custom: 'Custom' };
const VIS = ['everyone', 'friends', 'me'];
const ACCESS_KEYS = ['reduceMotion', 'describe', 'contrast', 'captions', 'noSparkle', 'colourNames'];
const PRIVACY_DEFAULT = { look: 'everyone', pronouns: 'friends', mood: 'friends', collection: 'everyone', poses: 'friends', roster: true, hideModel: false };
function cleanCustomPronouns(v) {
  const s = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!s) return { ok: true, value: '' };
  if (!/^[A-Za-z][A-Za-z/ '\-]*$/.test(s)) return { ok: false, message: 'Pronouns can only use letters, / and spaces.' };
  if (profanity.isDirty(s)) return { ok: false, message: 'Please choose different wording.' };
  return { ok: true, value: s };
}
const pronounText = (id, custom) => (id === 'custom' ? custom || '' : PRONOUNS[id] && id ? PRONOUNS[id] : '');
const canSee = (vis, rel) => rel === 'self' || vis === 'everyone' || (vis === 'friends' && rel === 'friend');

/* ------------------------------------------------------------------ default look + resolving what is actually shown */
const gOf = (g) => (g === 'female' ? 'female' : 'male');
function defaultLook(gender) {
  const f = gOf(gender) === 'female';
  return { body: 'average', skin: '#6b4226', hair: f ? 'braids_bun' : 'lowcut', hairColor: '#16100d', beard: 'none', top: 'top_tee', bottom: f ? 'bottom_skirt' : 'bottom_trousers', outfit: '', shoes: 'shoe_canvas', head: '', neckwear: '', hand: '', face: '', jewel: {}, makeup: {} };
}
const colorsOf = (id, gender, dyes) => {
  const it = ITEMS[id]; if (!it || !it.r) return null;
  const d = (dyes && dyes[id]) || {}, f = gOf(gender);
  let c1 = it.r.c1;
  if (FREE.includes(id) && (it.slot === 'top' || it.slot === 'shoes')) c1 = STARTER[f][it.slot][0];   // the free T-shirt and canvas shoes keep the old male/female colours
  return { c1: cleanHex(d.c1, c1), c2: cleanHex(d.c2, it.r.c2) };
};
const tatterOf = (dura, id) => (dura && typeof dura[id] === 'number' ? dura[id] <= TATTER_AT : false);

// ctx: { gender, dyes, dura, tailored[{id,...}], jobId, auto(bool autoUniform), now, hairAt, freshUntil, mood }
function resolve(look, ctx) {
  const L = Object.assign(defaultLook(ctx.gender), look || {});
  const now = ctx.now || Date.now(), dyes = ctx.dyes || {}, dura = ctx.dura || {}, tl = new Map((ctx.tailored || []).map((t) => [t.id, t]));
  let outfitId = L.outfit;
  if (ctx.auto && ctx.jobId && jobs.jobOf(ctx.jobId) && workHours(now) && ITEMS['uni_' + ctx.jobId]) outfitId = 'uni_' + ctx.jobId;   // 144: wear my uniform at work
  const piece = (id) => {
    if (!id) return null;
    if (id[0] === 't' && id[1] === '_' && tl.has(id.slice(2))) { const t = tl.get(id.slice(2)); return Object.assign(tailoredRender(t), { id, tatter: tatterOf(dura, id) }); }
    const it = ITEMS[id]; if (!it || !it.r) return null;
    const c = colorsOf(id, ctx.gender, dyes);
    return Object.assign({}, it.r, { id, c1: c.c1, c2: c.c2, tatter: tatterOf(dura, id) });
  };
  const out = piece(outfitId);
  const hair = HAIR[L.hair] ? L.hair : defaultLook(ctx.gender).hair;
  const hs = HAIR[hair], overgrown = !!(hs && ctx.hairAt && now - ctx.hairAt > hs.g * DAY);
  const r = {
    v: 1, body: BODIES[L.body] ? L.body : 'average', skin: SKIN.includes(L.skin) ? L.skin : '#6b4226', hair: { style: hair, color: cleanHex(L.hairColor, '#16100d'), messy: overgrown },
    beard: BEARDS[L.beard] ? L.beard : 'none', outfit: out, top: out ? null : piece(L.top), bottom: out ? null : piece(L.bottom), shoes: piece(L.shoes),
    head: piece(L.head), neckwear: piece(L.neckwear), hand: piece(L.hand), face: piece(L.face), jewel: {}, makeup: {}, mood: MOODS[ctx.mood] ? ctx.mood : 'neutral',
    fresh: !!(ctx.freshUntil && ctx.freshUntil > now), g: gOf(ctx.gender)
  };
  for (const k of Object.keys(JEWEL_SLOTS)) { const id = L.jewel && L.jewel[k]; if (id && ITEMS[id] && ITEMS[id].slot === JEWEL_SLOTS[k]) r.jewel[k] = Object.assign({}, ITEMS[id].r, { id }); }
  for (const k of Object.keys(MAKEUP_SLOTS)) { const m = L.makeup && L.makeup[k]; if (m && ITEMS[m.id] && ITEMS[m.id].slot === MAKEUP_SLOTS[k]) r.makeup[k] = { id: m.id, c: ITEMS[m.id].palette.includes(m.c) ? m.c : ITEMS[m.id].palette[0], a: Math.max(.3, Math.min(1, Number(m.a) || .7)) }; }
  return r;
}
// Items the player is actually wearing right now (for durability), by id.
function wornIds(look, ctx) {
  const L = Object.assign(defaultLook(ctx.gender), look || {}), ids = [];
  let outfitId = L.outfit; const now = ctx.now || Date.now();
  if (ctx.auto && ctx.jobId && jobs.jobOf(ctx.jobId) && workHours(now)) outfitId = 'uni_' + ctx.jobId;
  if (outfitId) ids.push(outfitId); else { if (L.top) ids.push(L.top); if (L.bottom) ids.push(L.bottom); }
  if (L.shoes) ids.push(L.shoes);
  return ids.filter((id) => (id.startsWith('t_') ? true : !!(ITEMS[id] && ITEMS[id].wear)));
}

/* ------------------------------------------------------------------ validating what the client asks to equip */
// ctx: { owned:Set, tailoredReady:Set (ids like t_xxx), dura, jobId }
function canWear(id, ctx) {
  if (!id) return { ok: true };
  if (id.startsWith('t_')) { if (!ctx.tailoredReady.has(id)) return { ok: false, message: 'That tailor-made piece is not ready or is not yours.' }; }
  else {
    const it = ITEMS[id]; if (!it) return { ok: false, message: 'Unknown item.' };
    const owns = isFree(id) || ctx.owned.has(id) || (it.job && it.job === ctx.jobId);
    if (!owns) return { ok: false, message: `You don't own ${it.name} yet.` };
  }
  if (ctx.dura && typeof ctx.dura[id] === 'number' && ctx.dura[id] <= 0) return { ok: false, message: 'That is worn out. Repair it at the tailor first.' };
  return { ok: true };
}
const slotOf = (id) => (id.startsWith('t_') ? 'outfit' : ITEMS[id] && ITEMS[id].slot);
function cleanLook(input, ctx) {
  input = input && typeof input === 'object' ? input : {};
  const out = {}, errors = [], b = (k, v) => { out[k] = v; };
  if ('body' in input) { if (BODIES[input.body]) b('body', input.body); else errors.push('Unknown body type.'); }
  if ('skin' in input) { if (SKIN.includes(String(input.skin).toLowerCase())) b('skin', String(input.skin).toLowerCase()); else errors.push('Pick a skin tone from the list.'); }
  for (const k of SLOTS_EQUIP) {
    if (!(k in input)) continue; const id = String(input[k] || '');
    if (!id) { b(k, ''); continue; }
    const s = slotOf(id); if (s !== k) { errors.push('That item does not go there.'); continue; }
    const c = canWear(id, ctx); if (c.ok) b(k, id); else errors.push(c.message);
  }
  if (input.jewel && typeof input.jewel === 'object') {
    out.jewel = {};
    for (const k of Object.keys(JEWEL_SLOTS)) { const id = String(input.jewel[k] || ''); if (!id) continue; if (!ITEMS[id] || ITEMS[id].slot !== JEWEL_SLOTS[k]) { errors.push('Wrong jewellery slot.'); continue; } const c = canWear(id, ctx); if (c.ok) out.jewel[k] = id; else errors.push(c.message); }
  }
  if (input.makeup && typeof input.makeup === 'object') {
    out.makeup = {};
    for (const k of Object.keys(MAKEUP_SLOTS)) {
      const m = input.makeup[k]; if (!m || !m.id) continue; const it = ITEMS[m.id];
      if (!it || it.slot !== MAKEUP_SLOTS[k]) { errors.push('Wrong makeup slot.'); continue; }
      const c = canWear(m.id, ctx); if (!c.ok) { errors.push(c.message); continue; }
      out.makeup[k] = { id: m.id, c: it.palette.includes(m.c) ? m.c : it.palette[0], a: Math.max(.3, Math.min(1, Number(m.a) || .7)) };
    }
  }
  return { look: out, errors };
}

/* ------------------------------------------------------------------ shop rules */
function buyCheck(id, owned, now = Date.now(), jobId = '') {
  const it = ITEMS[id]; if (!it) return { ok: false, code: 400, message: 'Unknown item.' };
  if (it.price === 0) return { ok: false, code: 409, message: 'That one is free: just wear it.' };
  if (owned.has(id)) return { ok: false, code: 409, message: 'You already own that.' };
  if (it.season && !seasonOn(it.season, now)) { const s = seasonInfo(it.season, now); return { ok: false, code: 403, message: `${it.name} is only sold in ${s.name}. It is back in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'}.` }; }
  if (it.job && jobId === it.job) return { ok: true, price: UNI_PRICE };
  return { ok: true, price: it.price };
}
const dyeCost = (id) => { const it = ITEMS[id]; return it && it.dye ? Math.max(1500, Math.round(it.price * .04 / 500) * 500) : 0; };
function hairPrice(id, st) {      // loyalty: every 5th visit is 10% off
  const h = HAIR[id]; if (!h) return null;
  return st && st.visits && (st.visits + 1) % LOYALTY_EVERY === 0 ? Math.round(h.price * (1 - LOYALTY_OFF) / 100) * 100 : h.price;
}
const touchupCost = (id) => { const h = HAIR[id]; return h ? Math.max(TOUCHUP_MIN, Math.round(h.price * SALON.touchup / 100) * 100) : TOUCHUP_MIN; };

/* ------------------------------------------------------------------ what the client may see in the catalogue */
function catalog(ms = Date.now()) {
  const items = Object.values(ITEMS).sort((a, b) => a.ord - b.ord).map((i) => ({ id: i.id, slot: i.slot, cat: i.cat, name: i.name, price: i.price, rarity: i.rarity, dye: i.dye, wear: i.wear, season: i.season || '', job: i.job || '', set: i.set || '',
    culture: i.culture || '', note: i.note || '', palette: i.palette || null, r: i.r || null, dyeCost: dyeCost(i.id) }));
  return {
    items, bodies: Object.entries(BODIES).map(([id, b]) => Object.assign({ id }, b)), skin: SKIN, hair: HAIRSTYLES, hairColors: HAIR_COLORS, beards: Object.entries(BEARDS).map(([id, v]) => ({ id, name: v[0], price: v[1] })),
    dyes: DYE_PALETTE, moods: MOODS, pronouns: PRONOUNS, salon: { colour: SALON.colour, wash: SALON.wash, spa: SALON.spa, loyaltyEvery: LOYALTY_EVERY, chair: CHAIR_SECONDS },
    seasons: Object.keys(SEASONS).map((id) => seasonInfo(id, ms)), tailor: { bases: TAILOR.bases, fabrics: TAILOR.fabrics, fits: Object.keys(TAILOR.fits), embroidery: TAILOR.embroidery, rush: TAILOR.rush, maxPieces: TAILOR.maxPieces, maxPending: TAILOR.maxPending, fashionDiscount: TAILOR.fashionDiscount, labelMax: TAILOR.labelMax },
    sets: SETS, durability: { max: DURA_MAX, tatter: TATTER_AT }, uniformPrice: UNI_PRICE
  };
}

module.exports = {
  DAY, SEASONS, seasonOn, seasonInfo, workHours, lagosParts, SKIN, HAIR_COLORS, HAIR_HEX, DYE_PALETTE, cleanHex, hexOk, BODIES, HAIRSTYLES, HAIR, BEARDS, SALON, FRESH_MS, CHAIR_SECONDS, LOYALTY_EVERY,
  ITEMS, FREE, SLOTS_EQUIP, JEWEL_SLOTS, MAKEUP_SLOTS, WEARS, isFree, MOODS, autoMood, TAILOR, tailorPrice, tailorReadyMs, cleanLabel, tailoredRender,
  DURA_MAX, TATTER_AT, WEAR_CREDIT_MS, WEAR_MIN_GAP_MS, WEAR_DAY_CAP_MS, repairCost, wearPoints, SETS, collectionOf, newTiers, titlesOf, setMembers,
  PRONOUNS, VIS, ACCESS_KEYS, PRIVACY_DEFAULT, cleanCustomPronouns, pronounText, canSee, defaultLook, resolve, wornIds, canWear, slotOf, cleanLook, buyCheck, dyeCost, hairPrice, touchupCost, catalog, UNI_PRICE
};
