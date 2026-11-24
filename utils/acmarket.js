// Street Market & Haggling Engine (Balogun Market, Computer Village, Makola)
// Includes real stalls, dynamic haggling rolls, vendor moods, and wholesale arbitrage.

const STALLS = [
  {
    id: 'balogun_fabrics',
    market: 'Balogun Market',
    marketLocation: 'Lagos Island',
    name: "Alhaji's Luxury Fabrics",
    emoji: '🧵',
    vendor: 'Alhaji Rasheed',
    vendorTone: 'shrewd',
    blurb: 'Premium Swiss lace, Kampala tie-dye, and Aso-Ebi yards straight from warehouse imports.',
    items: [
      { id: 'kampala_print', name: 'Kampala Wax Print (6 Yards)', price: 18000, minPrice: 12000, category: 'fabric', resellBonus: 1.4, emoji: '👘' },
      { id: 'swiss_lace', name: 'Swiss Voile Lace Cut', price: 45000, minPrice: 32000, category: 'fabric', resellBonus: 1.5, emoji: '✨' },
      { id: 'aso_ebi_bundle', name: 'Owambe Aso-Ebi Set', price: 30000, minPrice: 22000, category: 'fabric', resellBonus: 1.35, emoji: '🥻' }
    ]
  },
  {
    id: 'cv_gadgets',
    market: 'Computer Village',
    marketLocation: 'Ikeja',
    name: 'Chinedu Tech & Accessories',
    emoji: '📱',
    vendor: 'Chinedu (Tech Master)',
    vendorTone: 'fast-talker',
    blurb: 'Original fast-chargers, UK-used flagship phones, wireless airpods, and repair tools.',
    items: [
      { id: 'fast_charger', name: '65W Super Fast Charger', price: 8500, minPrice: 5000, category: 'gadget', resellBonus: 1.6, emoji: '🔌' },
      { id: 'airpods_pro', name: 'Wireless Noise-Cancel Pods', price: 35000, minPrice: 24000, category: 'gadget', resellBonus: 1.45, emoji: '🎧' },
      { id: 'phone_repair_kit', name: 'Precision Phone Repair Toolkit', price: 20000, minPrice: 14000, category: 'tool', resellBonus: 1.5, emoji: '🛠️' },
      { id: 'wholesale_screen_pack', name: 'Box of 10 Tempered Glasses', price: 12000, minPrice: 7500, category: 'wholesale', resellBonus: 1.8, emoji: '📦' }
    ]
  },
  {
    id: 'makola_provisions',
    market: 'Food Bazaar & Provisions',
    marketLocation: 'Mile 12 & Makola',
    name: 'Mama Bisi Foodstuff Emporium',
    emoji: '🧺',
    vendor: 'Mama Bisi',
    vendorTone: 'motherly',
    blurb: 'Fresh Derica bags of rice, pure groundnut oil, dried catfish, and cartons of noodles.',
    items: [
      { id: 'jollof_party_pack', name: 'Big Jollof Cooking Pack', price: 15000, minPrice: 10500, category: 'food', restores: { hunger: 0.6, fun: 0.2 }, emoji: '🍲' },
      { id: 'indomie_carton', name: 'Full Carton of Noodles', price: 16000, minPrice: 12500, category: 'pantry', emoji: '🍜' },
      { id: 'catfish_smoked', name: 'Smoked Catfish Batch', price: 9000, minPrice: 6500, category: 'food', restores: { hunger: 0.4 }, emoji: '🐟' }
    ]
  }
];

// Dialogue reactions based on haggling outcome
const HAGGLE_REACTIONS = {
  great: [
    '"Ah! You sabi price well well! Because na you, oya take am at this price." 🤝',
    '"You be pure Lagos hustler. Deal closed!" 🙌🏾',
    '"No wahala, my person. Pay make I wrap am for you." 🛍️'
  ],
  moderate: [
    '"Oga, you dey cut my profit o! But sha, make market move: pay this amount." 👌',
    '"Last price na him I give you so o, no deduct 1 naira again!" ⚖️',
    '"Alright, take am. Tell your paddies say na Chinedu give you this plug." 💼'
  ],
  refusal: [
    '"Haba! You wan make I go naked? That price cannot work at all!" 🙅🏾‍♂️',
    '"Capital sef pass that money wey you call! Add something on top." ❌',
    '"Chai, my brother, go round the market, if you see am cheaper come back." 🏃🏾'
  ]
};

function rollHaggle(basePrice, minPrice, userSkills = {}) {
  const charisma = userSkills.charisma || 0;
  const hustle = userSkills.hustle || 0;

  // Skill bonus adds between 5% and 30% edge
  const skillBonus = (charisma * 0.02) + (hustle * 0.03);
  const roll = Math.random() + skillBonus;

  if (roll > 0.75) {
    // Great success: close to minPrice
    const discount = basePrice - minPrice;
    const finalPrice = Math.round((minPrice + discount * 0.1) / 100) * 100;
    const quotes = HAGGLE_REACTIONS.great;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return { success: true, quality: 'great', finalPrice, discount: basePrice - finalPrice, quote };
  } else if (roll > 0.4) {
    // Moderate success: midway
    const discount = (basePrice - minPrice) * 0.5;
    const finalPrice = Math.round((basePrice - discount) / 100) * 100;
    const quotes = HAGGLE_REACTIONS.moderate;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return { success: true, quality: 'moderate', finalPrice, discount: basePrice - finalPrice, quote };
  } else {
    // Refusal
    const quotes = HAGGLE_REACTIONS.refusal;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return { success: false, quality: 'refusal', finalPrice: basePrice, discount: 0, quote };
  }
}

function findItem(itemId) {
  for (const s of STALLS) {
    const it = s.items.find(i => i.id === itemId);
    if (it) return { stall: s, item: it };
  }
  return null;
}

module.exports = {
  STALLS,
  rollHaggle,
  findItem
};
