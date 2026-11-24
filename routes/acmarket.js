const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { STALLS, rollHaggle, findItem } = require('../utils/acmarket');
const { timeline, queueCard } = require('../utils/accards');

const router = express.Router();
router.use(ensureAuth);

const bad = (res, code, message) => res.status(code).json({ message });

// List all market stalls and wares
router.get('/', async (req, res, next) => {
  try {
    const u = await ensureAC(req.user.id);
    const bag = (u.ac && u.ac.marketBag) || [];
    res.json({
      ok: true,
      stalls: STALLS,
      bag,
      cash: u.ac.cash,
      needs: u.ac.needs
    });
  } catch (e) {
    next(e);
  }
});

// Bargain / Haggle on an item
router.post('/haggle', async (req, res, next) => {
  try {
    const itemId = String((req.body && req.body.itemId) || '');
    const found = findItem(itemId);
    if (!found) return bad(res, 404, 'Item not found in any market stall.');

    const u = await ensureAC(req.user.id);
    const userSkills = {
      charisma: (u.xp ? Math.min(10, Math.floor(u.xp / 100)) : 1),
      hustle: (u.ac && u.ac.hustle && u.ac.hustle.streak ? Math.min(10, u.ac.hustle.streak) : 1)
    };

    const haggleResult = rollHaggle(found.item.price, found.item.minPrice, userSkills);

    res.json({
      ok: true,
      item: found.item,
      vendor: found.stall.vendor,
      vendorTone: found.stall.vendorTone,
      market: found.stall.market,
      ...haggleResult
    });
  } catch (e) {
    next(e);
  }
});

// Buy an item from the market
router.post('/buy', async (req, res, next) => {
  try {
    const itemId = String((req.body && req.body.itemId) || '');
    const agreedPrice = Number(req.body && req.body.price);
    const found = findItem(itemId);
    if (!found) return bad(res, 404, 'Item not found in any market stall.');

    const price = (Number.isFinite(agreedPrice) && agreedPrice >= found.item.minPrice && agreedPrice <= found.item.price)
      ? agreedPrice
      : found.item.price;

    const uid = req.user.id;
    const u = await ensureAC(uid);
    if (u.ac.cash < price) return bad(res, 402, `Not enough cash! You need ₦${price.toLocaleString('en-NG')}.`);

    const bagItem = {
      id: `${itemId}_${Date.now()}`,
      itemId: found.item.id,
      name: found.item.name,
      category: found.item.category,
      pricePaid: price,
      resellBonus: found.item.resellBonus || 1.3,
      boughtAt: new Date(),
      emoji: found.item.emoji
    };

    // If item restores needs (e.g. food), calculate restoration
    const incs = { 'ac.cash': -price };
    let needsUpdate = null;
    if (found.item.restores && Array.isArray(u.ac.needs)) {
      needsUpdate = [...u.ac.needs];
      if (found.item.restores.hunger) needsUpdate[0] = Math.min(1, needsUpdate[0] + found.item.restores.hunger);
      if (found.item.restores.fun) needsUpdate[2] = Math.min(1, needsUpdate[2] + found.item.restores.fun);
    }

    const setObj = {};
    if (needsUpdate) setObj['ac.needs'] = needsUpdate;

    const updated = await User.findByIdAndUpdate(uid, {
      $inc: incs,
      $push: { 'ac.marketBag': bagItem },
      ...(Object.keys(setObj).length ? { $set: setObj } : {})
    }, { new: true });

    timeline(uid, found.item.emoji, `Bought ${found.item.name} for ₦${price.toLocaleString('en-NG')} at ${found.stall.market}`);

    res.json({
      ok: true,
      message: `Purchased ${found.item.name}!`,
      item: bagItem,
      cash: updated.ac.cash,
      needs: updated.ac.needs,
      bag: updated.ac.marketBag
    });
  } catch (e) {
    next(e);
  }
});

// Resell an item or wholesale bundle
router.post('/resell', async (req, res, next) => {
  try {
    const bagItemId = String((req.body && req.body.bagItemId) || '');
    const uid = req.user.id;
    const u = await ensureAC(uid);

    const bag = (u.ac && u.ac.marketBag) || [];
    const item = bag.find(i => i.id === bagItemId);
    if (!item) return bad(res, 404, 'Item not found in your bag.');

    const profitMultiplier = item.resellBonus || 1.35;
    const resalePrice = Math.round((item.pricePaid * profitMultiplier) / 100) * 100;
    const netProfit = resalePrice - item.pricePaid;

    const updated = await User.findByIdAndUpdate(uid, {
      $pull: { 'ac.marketBag': { id: bagItemId } },
      $inc: { 'ac.cash': resalePrice, xp: 40 }
    }, { new: true });

    timeline(uid, '💰', `Resold ${item.name} for ₦${resalePrice.toLocaleString('en-NG')} (+₦${netProfit.toLocaleString('en-NG')} profit!)`);

    queueCard(req.app.get('io'), uid, {
      icon: '🤝',
      title: 'Market Flip Complete!',
      text: `You sold ${item.name} to a retail buyer on the street.`,
      lines: [
        ['Resale Payout', `+₦${resalePrice.toLocaleString('en-NG')}`],
        ['Net Profit', `+₦${netProfit.toLocaleString('en-NG')}`],
        ['XP Earned', '+40 XP']
      ],
      tone: 'good',
      btn: 'Sweet!'
    }).catch(() => {});

    res.json({
      ok: true,
      sold: item,
      resalePrice,
      netProfit,
      cash: updated.ac.cash,
      bag: updated.ac.marketBag
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
