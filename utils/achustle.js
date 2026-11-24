// 5-Pillar Daily Hustle System (Reverse-engineered from Vatarverse architecture).
// Rule definitions, payouts, validation and state calculations. No direct DB access here.

const LAGOS_MS = 3600000; // Africa/Lagos UTC+1 offset
const lagosDate = (ms = Date.now()) => new Date(ms + LAGOS_MS);
const dayKey = (ms = Date.now()) => lagosDate(ms).toISOString().slice(0, 10);

const HUSTLE_PILLARS = {
  grind: {
    id: 'grind',
    name: 'Street Grind',
    emoji: '🧺',
    tagline: 'Hawking, retail, traffic hustle',
    desc: 'Hit the asphalt: sell recharge cards, deliver chops, or push wares through traffic.',
    baseCash: 12000,
    baseXp: 50,
    energyCost: 20,
    cooldownSeconds: 120, // 2 minutes between task steps
    flavor: [
      'You dodged traffic on Ojuelegba bridge and sold 3 boxes of plantain chips.',
      'A driver in a Prado bought all your pure water and told you to keep the change.',
      'You ran down two buses on Ikorodu road and closed five sales before the light turned green.'
    ]
  },
  life: {
    id: 'life',
    name: 'Life & Home',
    emoji: '🍲',
    tagline: 'Domestic maintenance & grocery run',
    desc: 'Stock the kitchen, cook a pot of jollof, repair home fixtures, and handle family errands.',
    baseCash: 8000,
    baseXp: 35,
    energyCost: 15,
    cooldownSeconds: 120,
    flavor: [
      'You went to the local market, bargained for fresh tomatoes, and cooked a hot pot of stew.',
      'You fixed the leaking tap and sorted the generator fuel line before NEPA took the light.',
      'You sent food to your neighbour and cleaned the compound stairs.'
    ]
  },
  link: {
    id: 'link',
    name: 'Network & Pitch',
    emoji: '🤝',
    tagline: 'Connect, network & pitch deals',
    desc: 'Meet an investor in Victoria Island, pitch your idea at CcHub, or close a freelance deal.',
    baseCash: 10000,
    baseXp: 45,
    energyCost: 15,
    cooldownSeconds: 120,
    flavor: [
      'You pitched your startup idea to a tech founder over coffee in Yaba. They asked for your deck!',
      'You connected two businessmen at a lounge in VI and earned a sweet finder’s fee.',
      'You closed a client contract over WhatsApp voice call before lunchtime.'
    ]
  },
  learn: {
    id: 'learn',
    name: 'Skill Up',
    emoji: '🧠',
    tagline: 'Courses, study & skill training',
    desc: 'Study at the library, practice coding, rehearse music tracks, or take a short business course.',
    baseCash: 5000,
    baseXp: 25,
    energyCost: 10,
    cooldownSeconds: 120,
    flavor: [
      'You spent an hour mastering JavaScript async/await in the CcHub library.',
      'You practiced Afrobeats chord progressions on your guitar until your fingers hurt.',
      'You read three chapters of a business playbook and took detailed notes.'
    ]
  },
  step: {
    id: 'step',
    name: 'Major Move',
    emoji: '🚀',
    tagline: 'High-stakes milestone & big play',
    desc: 'Execute a bold play: bid on a government supply gig, stage an event, or launch a product.',
    baseCash: 15000,
    baseXp: 60,
    energyCost: 25,
    cooldownSeconds: 180,
    flavor: [
      'You submitted a tender proposal for the local secretariat refurbishment. Bold move!',
      'You secured prime wholesale stock before anyone else at Balogun Market.',
      'You locked in a headline DJ for your upcoming weekend beach party.'
    ]
  }
};

const HUSTLE_BONUS = {
  cash: 20000,
  xp: 100,
  desc: 'Daily 5-Pillar Completion Bonus'
};

const BREAKTHROUGH_BASE = {
  cash: 100000,
  xp: 400,
  chance: 0.12, // 12% chance on completing all 5 pillars
  desc: 'Windfall Breakthrough! An investor or angel noticed your relentless grind.'
};

function stateFor(userAc, now = Date.now()) {
  const today = dayKey(now);
  const raw = (userAc && userAc.hustle) || {};
  const isToday = raw.day === today;
  const completed = isToday && Array.isArray(raw.completed) ? raw.completed : [];
  const streak = isToday ? (raw.streak || 0) : ((raw.day && isYesterday(raw.day, today)) ? (raw.streak || 0) : 0);
  const bonusClaimed = isToday && !!raw.bonusClaimed;
  const lastAction = raw.lastAction ? new Date(raw.lastAction).getTime() : 0;

  const pillars = Object.values(HUSTLE_PILLARS).map(p => {
    const done = completed.includes(p.id);
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      tagline: p.tagline,
      desc: p.desc,
      cash: p.baseCash,
      xp: p.baseXp,
      energyCost: p.energyCost,
      done,
      cooldownLeft: Math.max(0, Math.ceil((lastAction + p.cooldownSeconds * 1000 - now) / 1000))
    };
  });

  const allDone = pillars.every(p => p.done);

  return {
    day: today,
    pillars,
    completedCount: completed.length,
    totalPillars: pillars.length,
    allDone,
    bonusClaimed,
    streak,
    bonusReward: HUSTLE_BONUS,
    breakthroughReward: BREAKTHROUGH_BASE
  };
}

function isYesterday(dayA, dayB) {
  const msA = Date.parse(dayA + 'T00:00:00Z');
  const msB = Date.parse(dayB + 'T00:00:00Z');
  return msB - msA === 86400000;
}

module.exports = {
  HUSTLE_PILLARS,
  HUSTLE_BONUS,
  BREAKTHROUGH_BASE,
  dayKey,
  stateFor
};
