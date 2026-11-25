// Public (no login) data for the /advertise and /stats pages: prices, what is on air right now, live numbers.
const express = require('express');
const ACAd = require('../models/ACAd');
const ACStat = require('../models/ACStat');
const acPresence = require('../utils/acpresence');
const A = require('../utils/acads');

const router = express.Router();
const lagosDay = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);

async function live() {
  const [g, d] = await Promise.all([ACStat.findById('global').lean(), ACStat.findById('day:' + lagosDay()).lean()]);
  return { online: acPresence.count(), visitsToday: (d && d.visits) || 0, visitsTotal: (g && g.visits) || 0, gems: (g && g.gems) || 0, at: Date.now() };
}

router.get('/advertise', async (req, res, next) => {
  try {
    await ACAd.deleteMany({ expiresAt: { $lte: new Date() } });
    const rows = await ACAd.find().sort({ startAt: -1 }).limit(40).lean();
    const bb = rows.filter((a) => a.kind === 'billboard' || a.kind === 'app');
    res.set('Cache-Control', 'no-cache');
    res.json({ rates: A.PUBLIC, airports: A.AIRPORTS, boards: A.BILLBOARD.slots, plots: A.SEA.plots, appSlots: A.APP.slots,
      onAir: { ads: bb.length, list: rows.filter((a) => a.image).slice(0, 12).map((a) => ({ title: a.title, image: a.image })) }, live: await live() });
  } catch (e) { next(e); }
});
router.get('/stats', async (req, res, next) => { try { res.set('Cache-Control', 'no-cache'); res.json(await live()); } catch (e) { next(e); } });

module.exports = router;
