// AllConnect Hub: onboarding choices, beginner missions, newspaper, ticker, help, roadmap, lore, anthem.
// Pure data + small functions (no database access), so routes and tests can share them.
const HOUR = 3600e3, DAY = 24 * HOUR;
const lagos = (now) => new Date(now + HOUR);
const dayKey = (now) => lagos(now).toISOString().slice(0, 10);

/* ---------- the promise ---------- */
const PROMISE = {
  tagline: 'Live a whole Lagos life, online.',
  line: 'Get a job, pay your bills, decorate your flat, make friends, play games and watch the city change around you. AllConnect never resets: your life keeps going, even when you close the app.',
  day1: ['Pick your area, job and hobby in under a minute', 'Collect your welcome parcel and finish your first missions', 'Be protected from big-money risks for your first 7 days']
};
const PROTECT_DAYS = 7;
const PROTECT = { transferMax: 20000, investMax: 1500000, noAds: true };   // first 7 days: small transfers, no big investments, no ad buying

/* ---------- onboarding choices ---------- */
const NEIGHBOURHOODS = [
  { id: 'yaba', name: 'Yaba', emoji: '💻', vibe: 'Tech hub. Students, startups, suya at night.', perk: 'Tech jobs feel closer to home.' },
  { id: 'surulere', name: 'Surulere', emoji: '⚽', vibe: 'Football, family and good food on every street.', perk: 'Friendly neighbours, lots of games.' },
  { id: 'lekki', name: 'Lekki', emoji: '🌴', vibe: 'Beaches, estates and expensive coffee.', perk: 'Great for investors.' },
  { id: 'ikeja', name: 'Ikeja', emoji: '✈️', vibe: 'The airport, Computer Village and the mainland buzz.', perk: 'Busy and well connected.' },
  { id: 'ajah', name: 'Ajah', emoji: '🚌', vibe: 'Long commute, cheap rent, big dreams.', perk: 'Low rent, tough mornings.' },
  { id: 'ikorodu', name: 'Ikorodu', emoji: '⛴️', vibe: 'Boat rides, big markets, strong community.', perk: 'Everybody knows everybody.' }
];
const HOBBIES = [
  { id: 'gaming', name: 'Gaming', emoji: '🎮', words: ['Gamer', 'Pro', 'Clutch'] },
  { id: 'music', name: 'Music', emoji: '🎧', words: ['Beat', 'Afro', 'Vibes'] },
  { id: 'football', name: 'Football', emoji: '⚽', words: ['Striker', 'Naija', 'Goal'] },
  { id: 'fashion', name: 'Fashion', emoji: '🧵', words: ['Drip', 'Aso', 'Stitch'] },
  { id: 'food', name: 'Food', emoji: '🍛', words: ['Jollof', 'Suya', 'Chop'] },
  { id: 'business', name: 'Business', emoji: '💼', words: ['Oga', 'Hustle', 'Boss'] },
  { id: 'tech', name: 'Tech', emoji: '👨🏾‍💻', words: ['Dev', 'Byte', 'Code'] },
  { id: 'art', name: 'Art & photos', emoji: '📸', words: ['Snap', 'Frame', 'Colour'] }
];
const HOBBY_IDS = HOBBIES.map((h) => h.id), HOOD_IDS = NEIGHBOURHOODS.map((h) => h.id);
const STARTER_JOBS = ['transport', 'fashion', 'tech', 'banking', 'health', 'oil'];     // ids in utils/acjobs.js

const ONBOARD_STEPS = [
  { id: 'hood', title: 'Choose your area' },
  { id: 'job', title: 'Choose a starter job' },
  { id: 'hobby', title: 'Choose a hobby' },
  { id: 'name', title: 'Pick a username' },
  { id: 'tour', title: 'Take the 60-second tour' }
];

/* username ideas from name + hobby + area (client still checks they are free) */
function usernameSuggestions(name, hobbyId, hoodId, seed = 0) {
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = clean(String(name || '').split(/\s+/)[0]).slice(0, 8) || 'lagos';
  const h = HOBBIES.find((x) => x.id === hobbyId), words = h ? h.words.map(clean) : ['naija', 'oga', 'vibes'];
  const hood = clean(hoodId).slice(0, 8) || 'lagos';
  const nums = [7, 24, 99, 101, 234, 360];
  const out = [n + '_' + words[0], words[1] + n, n + hood, n + '_' + nums[(seed + 1) % nums.length], hood + '_' + words[2], n + nums[seed % nums.length]];
  return [...new Set(out.map((x) => x.slice(0, 20)).filter((x) => x.length >= 3))].slice(0, 6);
}

/* ---------- missions (all verified on the server) ---------- */
const MISSIONS = [
  { id: 'm_hood', title: 'Choose your neighbourhood', hint: 'Open the welcome setup and pick an area.', reward: 5000, fa: 'location-dot', group: 'start' },
  { id: 'm_job', title: 'Start a job', hint: 'Phone → Jobs → pick one.', reward: 10000, fa: 'briefcase', group: 'start' },
  { id: 'm_shift', title: 'Work your first shift', hint: 'Open Jobs and tap Work a shift now.', reward: 15000, fa: 'clock', group: 'start' },
  { id: 'm_decor', title: 'Decorate your flat', hint: 'Buy and place 3 new items in Buy mode.', reward: 20000, fa: 'couch', group: 'home' },
  { id: 'm_friend', title: 'Make your first friend', hint: 'Phone → Contacts → search a @username.', reward: 25000, fa: 'user-group', group: 'social' },
  { id: 'm_group', title: 'Join or start a group', hint: 'Phone → Messages → Groups.', reward: 20000, fa: 'users', group: 'social' },
  { id: 'm_place', title: 'Finish 3 placement matches', hint: 'GameHub → play 3 games against bots. Warm up first!', reward: 30000, fa: 'flag-checkered', group: 'games' },
  { id: 'm_human', title: 'Play your first human match', hint: 'GameHub → Quick match or Beginner queue.', reward: 30000, fa: 'handshake', group: 'games' },
  { id: 'm_streak', title: 'Play on 2 different days', hint: 'Come back tomorrow and play one more game.', reward: 25000, fa: 'fire', group: 'games' },
  { id: 'm_bill', title: 'Pay a bill', hint: 'Phone → Bank → Bills.', reward: 10000, fa: 'bolt', group: 'city' }
];
const MBYID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
const PLACEMENT_NEEDED = 3;

/* personalised task list: a handful of next-best steps, shaped by the hobby the player chose */
function personalTasks(state, missions) {
  const left = missions.filter((m) => !m.claimed);
  const prefer = { gaming: 'games', football: 'games', music: 'social', fashion: 'home', food: 'city', business: 'start', tech: 'start', art: 'home' }[state.hobby] || 'start';
  const rank = (m) => (m.done && !m.claimed ? 0 : m.group === prefer ? 1 : 2);
  return left.sort((a, b) => rank(a) - rank(b)).slice(0, 4);
}

/* ---------- welcome parcels (first 7 days) ---------- */
const PARCEL = [20000, 25000, 30000, 35000, 40000, 50000, 80000];
const parcelFor = (n) => PARCEL[Math.min(PARCEL.length - 1, Math.max(0, n))];

/* ---------- invites and welcome-back gift (first friend / group / streak rewards are missions) ---------- */
const INVITE = { inviter: 50000, invitee: 30000, windowDays: 7 };
const RETURN = { minDays: 3, gift: 25000 };

/* ---------- protection ---------- */
const protectedUntil = (createdAt) => new Date(new Date(createdAt || Date.now()).getTime() + PROTECT_DAYS * DAY);
const isProtected = (createdAt, now = Date.now()) => !!createdAt && protectedUntil(createdAt).getTime() > now;     // unknown age = not protected (never lock anyone by accident)
const protectionLeftDays = (createdAt, now = Date.now()) => !createdAt ? 0 : Math.max(0, Math.ceil((protectedUntil(createdAt).getTime() - now) / DAY));

/* ---------- weekly product theme ---------- */
const THEMES = [
  { id: 'home', title: 'Home Sweet Home Week', fa: 'house', color: '#f59e0b', text: 'Decorate your flat. Show it off to friends.', goal: 'Place 3 new items in Buy mode.', go: 'buy' },
  { id: 'hustle', title: 'Hustle Week', fa: 'briefcase', color: '#10b981', text: 'Work shifts, chase promotions and keep your bills paid.', goal: 'Work 5 shifts this week.', go: 'jobs' },
  { id: 'friends', title: 'Squad Week', fa: 'user-group', color: '#6366f1', text: 'Add friends, start a group, send a message.', goal: 'Add 2 friends.', go: 'contacts' },
  { id: 'games', title: 'GameHub Week', fa: 'gamepad', color: '#e5484d', text: 'Beat a bot, then challenge a human.', goal: 'Win 2 matches.', go: 'gamehub' },
  { id: 'gist', title: 'P-Gist Week', fa: 'microphone-lines', color: '#e8337a', text: 'Post your gist and join the conversation.', goal: 'Post 2 gists.', go: 'gist' },
  { id: 'money', title: 'Money Smart Week', fa: 'sack-dollar', color: '#0ea5e9', text: 'Look at Invest and set your pay PIN. Grow your naira.', goal: 'Own one investment.', go: 'invest' }
];
function weekIndex(now) { return Math.floor((lagos(now).getTime() - 4 * DAY) / (7 * DAY)); }     // weeks roll over Monday (Unix epoch day 0 was a Thursday)
const weeklyTheme = (now = Date.now()) => ({ ...THEMES[((weekIndex(now) % THEMES.length) + THEMES.length) % THEMES.length], endsAt: (weekIndex(now) + 1) * 7 * DAY + 4 * DAY - HOUR });

/* ---------- newspaper + ticker ---------- */
const HEADLINES = {
  fuel: ['Queues at every station as fuel runs short', 'Fares jump while danfo drivers count their liters'],
  nepa: ['Light don go again: city runs on generators', 'Generator sellers smile as the grid goes down'],
  goslow: ['Third Mainland crawls as traffic builds', 'Drivers earn more while everyone else waits'],
  rain: ['Flood dey road: low areas under water', 'Boat riders spotted on Ikorodu main road'],
  owambe: ['Owambe weekend: aso-ebi sellers are overwhelmed', 'Small chops vanish before the DJ arrives'],
  market: ['Balogun traders slash prices for market day', 'Shoppers pack the lanes for cheap deals'],
  calm: ['A calm day in Lagos. Enjoy it while it lasts', 'City quiet as prices hold steady']
};
function newspaper(ctx) {
  const ev = ctx.event, h = HEADLINES[ev.id] || HEADLINES.calm, th = ctx.theme, date = lagos(ctx.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const stories = [{ tag: 'CITY', title: h[0], body: ev.text }, { tag: 'STREET', title: h[1], body: ev.pidginText || ev.pidgin }];
  stories.push({ tag: 'THIS WEEK', title: th.title, body: th.text + ' Goal: ' + th.goal });
  if (ctx.richest) stories.push({ tag: 'MONEY', title: `${ctx.richest.name} tops the rich list`, body: `With ${ctx.richest.cash} in the bank, ${ctx.richest.name} leads Lagos right now. Can you catch up?` });
  if (ctx.gist) stories.push({ tag: 'GIST', title: `${ctx.gist.count} gists in the last 24 hours`, body: ctx.gist.top ? `Hot topic: ${ctx.gist.top}. Open P-Gist to join in.` : 'Open P-Gist to see what people are saying.' });
  if (ctx.players) stories.push({ tag: 'PLAYERS', title: `${ctx.players} players have made Lagos home`, body: 'New neighbours move in every day. Say hello.' });
  const classifieds = ['WANTED: Danfo conductor, no experience needed. Apply in Jobs.', 'FOR SALE: Plot of land in Lekki. See Invest.', 'LOST: One generator. Reward: small chops.'];
  return { date, name: 'The Lagos Gist', issue: 'Daily edition', stories, classifieds };
}
function ticker(ctx) {
  const l = [`${ctx.event.icon} ${ctx.event.title}: ${ctx.event.pidgin}`, `📅 This week: ${ctx.theme.title}`];
  if (ctx.next) l.push(`⏭️ Next up: ${ctx.next.title}`);
  if (ctx.online) l.push(`🟢 ${ctx.online.toLocaleString('en-NG')} players online now`);
  if (ctx.richest) l.push(`💰 ${ctx.richest.name} leads the rich list`);
  if (ctx.gistCount) l.push(`🗣️ ${ctx.gistCount} new gists today`);
  (ctx.admin || []).forEach((t) => l.push('📢 ' + t));
  return l;
}

/* ---------- help desk ---------- */
const HELP = [
  { q: 'How do I earn ₦?', a: 'Phone → Jobs. Pick a job and work shifts, or tick "Go automatically". Missions, quests and the daily bonus pay too.', go: 'jobs' },
  { q: 'What are the bills?', a: 'Electricity, water and waste are issued every Monday and due by Sunday night. Late bills cost 10% more and unpaid electricity means a power cut.', go: 'bank' },
  { q: 'How do I add a friend?', a: 'Phone → Contacts. Search their @username and tap Add. Set your own @username in Settings so they can find you.', go: 'contacts' },
  { q: 'How do I decorate my flat?', a: 'Tap Buy at the bottom. Open the Catalogue, choose an item, then place it on the floor. Drag to move it later.', go: 'buy' },
  { q: 'How do I play with others?', a: 'Phone → GameHub. Quick match pairs you with someone. New players can join the Beginner queue.', go: 'gamehub' },
  { q: 'Is my money safe?', a: 'Every ₦ move is checked by the server. New players are protected from high-stakes moves for their first 7 days.', go: null },
  { q: 'What is the city event?', a: 'Every 12 hours something happens in Lagos: rain, NEPA, fuel queues. Events change prices and job pay. See the Lagos Life sheet.', go: 'city' },
  { q: 'I forgot my password', a: 'On the sign-in screen tap "Recover account" and enter your recovery code. You get that code in the welcome setup. If you lost it, contact support from Phone → Police → Support.', go: null },
  { q: 'My game feels slow', a: 'Turn on Saver mode in Settings → Display. It stops background loading and music.', go: 'settings' },
  { q: 'Where is my data?', a: 'Your life is saved online. It continues when you close the app. "New life" in the sign-in screen is the only thing that resets it.', go: null }
];

/* ---------- roadmap + feature voting ---------- */
const ROADMAP = [
  { id: 'r_pay', lane: 'Now', title: 'Real top-up and withdrawals', note: 'Deposit and bank transfer are coming soon.' },
  { id: 'r_cars', lane: 'Next', title: 'Cars and the daily commute', note: 'Own a car, beat the go-slow.' },
  { id: 'r_house', lane: 'Next', title: 'Rent or buy a bigger home', note: 'Move out of your starter flat.' },
  { id: 'r_clubs', lane: 'Later', title: 'Neighbourhood clubs', note: 'Join your area against other areas.' },
  { id: 'r_pets', lane: 'Later', title: 'Pets', note: 'Adopt a pet. Feed it. Walk it.' }
];
const VOTES = [
  { id: 'v_cars', title: 'Cars and driving', fa: 'car' },
  { id: 'v_house', title: 'Bigger homes to rent or buy', fa: 'house-chimney' },
  { id: 'v_pets', title: 'Pets', fa: 'paw' },
  { id: 'v_club', title: 'Neighbourhood clubs', fa: 'people-roof' },
  { id: 'v_school', title: 'School and skills', fa: 'graduation-cap' },
  { id: 'v_music', title: 'Live concerts and owambe', fa: 'music' }
];
const VBYID = Object.fromEntries(VOTES.map((v) => [v.id, v]));

/* ---------- changelog ---------- */
const CHANGELOG = [
  { v: '2.4', date: '2026-10-09', title: 'Welcome to Lagos hub', items: ['New player setup: area, job, hobby and username', 'What can I do now? button on the home screen', 'Beginner missions with visible rewards', 'City newspaper, ticker, help desk, roadmap and voting', 'Result cards for work, promotions and investment payouts', 'Fixed the Manage requirements list overlap'] },
  { v: '2.3', date: '2026-10-05', title: 'Lagos Life', items: ['City events every 12 hours', 'Weekly bills and power cuts', 'Starter quests and the daily streak', 'Creator programme screen'] },
  { v: '2.2', date: '2026-09-28', title: 'Invest and Ads', items: ['Land, businesses and trucks', 'Create your own ad app'] }
];

/* ---------- lore ---------- */
const LORE = [
  { id: 'l1', title: 'How Lagos began', fa: 'water', text: 'Lagos began as a few fishing villages on a lagoon. Boats, traders and dreamers kept arriving. Nobody planned a megacity. It just happened, one hustle at a time.' },
  { id: 'l2', title: 'The go-slow', fa: 'car-side', text: 'Every Lagosian has a go-slow story. The bridge, the roundabout, the one pothole nobody fixes. The wise carry snacks and patience.' },
  { id: 'l3', title: 'Light and NEPA', fa: 'bolt', text: 'The light comes and goes. Neighbours trade fuel, generators hum all night, and when power returns the whole street shouts "Up NEPA!"' },
  { id: 'l4', title: 'Owambe', fa: 'champagne-glasses', text: 'No Saturday is complete without a party you were not fully invited to. Aso-ebi, jollof, a loud MC. Everybody dances.' },
  { id: 'l5', title: 'The six areas', fa: 'map-location-dot', text: 'Yaba builds apps. Surulere breathes football. Lekki sips coffee by the sea. Ikeja watches planes. Ajah commutes. Ikorodu rides the boat. Pick yours.' },
  { id: 'l6', title: 'Mummy', fa: 'heart', text: 'Mummy always picks up. Mummy knows your business before you do. Mummy says come home and eat.' }
];

/* ---------- the city anthem (original words + tune as note arrays for WebAudio) ---------- */
const ANTHEM = {
  title: 'Lagos, We Dey!',
  lyrics: ['Sun don rise for Lagos, we dey go!', 'Danfo horn dey blow, the hustle dey flow.', 'Light go, light come, we no go fear,', 'Na Lagos we dey, na Lagos we dey here!', '', 'Jollof for the party, suya for the night,', 'Small small, we dey climb, we go reach the height.', 'All connect, all connect, one big city sound,', 'Lagos, Lagos, na the best for town!'],
  bpm: 108,
  // [midi note, beats]; 0 = rest
  melody: [[67, 1], [69, 1], [72, 1.5], [69, .5], [67, 1], [64, 1], [67, 2], [67, 1], [69, 1], [72, 1], [74, 1], [72, 1], [69, 1], [67, 2], [64, 1], [64, 1], [67, 1], [69, 1], [72, 2], [69, 1], [67, 1], [64, 1], [62, 1], [60, 3], [0, 1]],
  bass: [[48, 2], [43, 2], [45, 2], [43, 2], [48, 2], [41, 2], [43, 2], [48, 2], [48, 2], [43, 2], [45, 2], [41, 2], [43, 2], [48, 2], [43, 2], [48, 2]]
};

/* ---------- return recap ---------- */
function recapKind(lastSeen, now = Date.now()) {
  if (!lastSeen) return null;
  const gap = now - new Date(lastSeen).getTime();
  if (gap < 6 * HOUR) return null;
  return { days: Math.floor(gap / DAY), long: gap >= RETURN.minDays * DAY };
}

/* ---------- onboarding progress map ---------- */
function progressMap(h, m) {
  const t = (id) => !!(m.find((x) => x.id === id) || {}).done;
  return [
    { id: 'setup', title: 'Setup', fa: 'user-plus', done: !!h.done }, { id: 'tour', title: 'City tour', fa: 'route', done: !!h.tourDone },
    { id: 'controls', title: 'Controls', fa: 'hand-pointer', done: !!h.controlsDone }, { id: 'job', title: 'First shift', fa: 'briefcase', done: t('m_shift') },
    { id: 'friend', title: 'First friend', fa: 'user-group', done: t('m_friend') }, { id: 'play', title: 'First match', fa: 'gamepad', done: t('m_place') },
    { id: 'human', title: 'Vs a human', fa: 'handshake', done: t('m_human') }
  ];
}

const cleanId = (v, list) => (list.includes(String(v)) ? String(v) : '');
module.exports = {
  PROMISE, PROTECT_DAYS, PROTECT, NEIGHBOURHOODS, HOBBIES, HOBBY_IDS, HOOD_IDS, STARTER_JOBS, ONBOARD_STEPS, usernameSuggestions,
  MISSIONS, MBYID, PLACEMENT_NEEDED, personalTasks, PARCEL, parcelFor, INVITE, RETURN, protectedUntil, isProtected, protectionLeftDays,
  THEMES, weeklyTheme, newspaper, ticker, HELP, ROADMAP, VOTES, VBYID, CHANGELOG, LORE, ANTHEM, recapKind, progressMap, cleanId, dayKey
};
