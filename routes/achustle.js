const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { HUSTLE_PILLARS, HUSTLE_BONUS, BREAKTHROUGH_BASE, dayKey, stateFor } = require('../utils/achustle');
const { timeline, queueCard } = require('../utils/accards');

const router = express.Router();
router.use(ensureAuth);

const bad = (res, code, message) => res.status(code).json({ message });

// Get current day's hustle state
router.get('/', async (req, res, next) => {
  try {
    const u = await ensureAC(req.user.id);
    const state = stateFor(u.ac, Date.now());
    res.json({ ok: true, state, cash: u.ac.cash, xp: u.xp || 0 });
  } catch (e) {
    next(e);
  }
});

// Perform a hustle task
router.post('/do', async (req, res, next) => {
  try {
    const pillarId = String((req.body && req.body.pillar) || '').toLowerCase();
    const pillar = HUSTLE_PILLARS[pillarId];
    if (!pillar) return bad(res, 400, 'Invalid hustle pillar.');

    const now = Date.now();
    const today = dayKey(now);
    const uid = req.user.id;
    let u = await ensureAC(uid);

    let hState = stateFor(u.ac, now);
    const existingPillar = hState.pillars.find(p => p.id === pillarId);
    if (!existingPillar) return bad(res, 400, 'Unknown pillar.');
    if (existingPillar.done) return bad(res, 409, `You already completed your ${pillar.name} for today! Come back tomorrow.`);
    if (existingPillar.cooldownLeft > 0) return bad(res, 429, `Catch your breath! Wait ${existingPillar.cooldownLeft}s before your next move.`);

    // Pick random flavor text
    const flavor = pillar.flavor[Math.floor(Math.random() * pillar.flavor.length)];
    const earnedCash = pillar.baseCash;
    const earnedXp = pillar.baseXp;

    // Build update
    const prevCompleted = (u.ac && u.ac.hustle && u.ac.hustle.day === today && Array.isArray(u.ac.hustle.completed))
      ? u.ac.hustle.completed
      : [];
    const newCompleted = [...new Set([...prevCompleted, pillarId])];
    const allDone = Object.keys(HUSTLE_PILLARS).every(k => newCompleted.includes(k));

    let bonusAwarded = 0;
    let bonusXp = 0;
    let breakthrough = false;
    let streak = hState.streak;

    if (allDone && !hState.bonusClaimed) {
      bonusAwarded = HUSTLE_BONUS.cash;
      bonusXp = HUSTLE_BONUS.xp;
      streak += 1;
      // Breakthrough roll
      if (Math.random() < BREAKTHROUGH_BASE.chance) {
        breakthrough = true;
        bonusAwarded += BREAKTHROUGH_BASE.cash;
        bonusXp += BREAKTHROUGH_BASE.xp;
      }
    }

    const totalCash = earnedCash + bonusAwarded;
    const totalXp = earnedXp + bonusXp;

    // Atomically update user
    const updated = await User.findByIdAndUpdate(uid, {
      $inc: {
        'ac.cash': totalCash,
        xp: totalXp
      },
      $set: {
        'ac.hustle.day': today,
        'ac.hustle.completed': newCompleted,
        'ac.hustle.lastAction': new Date(now),
        'ac.hustle.streak': streak,
        'ac.hustle.bonusClaimed': allDone
      }
    }, { new: true });

    // Timeline event
    timeline(uid, pillar.emoji, `${pillar.name}: +₦${earnedCash.toLocaleString('en-NG')} (${flavor})`);

    // In-game notification / reward card
    if (allDone && bonusAwarded > 0) {
      if (breakthrough) {
        queueCard(req.app.get('io'), uid, {
          icon: '💎',
          title: '🔥 WINDFALL BREAKTHROUGH!',
          text: `Your daily grind paid off! An influential patron rewarded your hustle with a massive grant.`,
          lines: [
            ['Bonus Cash', `+₦${bonusAwarded.toLocaleString('en-NG')}`],
            ['XP Boost', `+${bonusXp} XP`],
            ['Daily Streak', `${streak} Days 🔥`]
          ],
          tone: 'gold',
          btn: 'Let\'s Go!'
        }).catch(() => {});
      } else {
        queueCard(req.app.get('io'), uid, {
          icon: '🌟',
          title: '5/5 Hustle Complete!',
          text: `You crushed all 5 daily hustle pillars today! Streak is now ${streak} days strong.`,
          lines: [
            ['Bonus Cash', `+₦${bonusAwarded.toLocaleString('en-NG')}`],
            ['Bonus XP', `+${bonusXp} XP`],
            ['Streak', `${streak} Days`]
          ],
          tone: 'good',
          btn: 'Collect'
        }).catch(() => {});
      }
    }

    const nextState = stateFor(updated.ac, now);

    res.json({
      ok: true,
      pillar: pillarId,
      flavor,
      earnedCash,
      earnedXp,
      bonusAwarded,
      breakthrough,
      state: nextState,
      cash: updated.ac.cash,
      xp: updated.xp
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
