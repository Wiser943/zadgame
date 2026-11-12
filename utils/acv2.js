// Character traits, privacy defaults and wallet top-up packs. No database access here.
const TRAITS = [
  { id: 'hustler', icon: '💼', name: 'Hustler', text: 'Money matters. You feel good when cash is flowing.' },
  { id: 'gymrat', icon: '💪', name: 'Gym Rat', text: 'Strong body, strong mind. Low energy hits you hard.' },
  { id: 'foodie', icon: '🍛', name: 'Foodie', text: 'A full belle is a happy belle.' },
  { id: 'party', icon: '🎉', name: 'Party Animal', text: 'You need fun like you need air.' },
  { id: 'homebody', icon: '🏠', name: 'Homebody', text: 'A nice home makes you glow.' },
  { id: 'social', icon: '🦋', name: 'Social Butterfly', text: 'Friends are your fuel. Loneliness hurts.' },
  { id: 'neat', icon: '🧼', name: 'Neat Freak', text: 'You cannot relax when you are not clean.' },
  { id: 'music', icon: '🎵', name: 'Music Lover', text: 'A good song fixes most things.' },
  { id: 'bookworm', icon: '📚', name: 'Bookworm', text: 'Calm and curious. Quiet moments recharge you.' },
  { id: 'explorer', icon: '🧭', name: 'Explorer', text: 'You love seeing new corners of Lagos.' }
];
const TRAIT_IDS = TRAITS.map((t) => t.id);
const PREF_DEFAULTS = { readReceipts: true, whoCanMessage: 'everyone', whoCanSendMoney: 'anyone', showRelationships: false, showBirthday: false, marketingEmails: false, freeWill: true };
// Wallet packs. coins = game money. Prices are fixed here on the server, never taken from the browser.
const PACKS = [
  { id: 'hustle', icon: '🍲', name: 'Hustle', coins: 50000, ngn: 1000, usd: 1 },
  { id: 'glowup', icon: '🎊', name: 'Glow Up', coins: 300000, ngn: 5000, usd: 4 },
  { id: 'biglife', icon: '💼', name: 'Big Life', coins: 700000, ngn: 10000, usd: 7, best: true },
  { id: 'legend', icon: '👑', name: 'Legend', coins: 1600000, ngn: 20000, usd: 14 }
];
const NG_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "Outside Nigeria"];
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);
module.exports = { NG_STATES, TRAITS, TRAIT_IDS, PREF_DEFAULTS, PACKS, clean };
