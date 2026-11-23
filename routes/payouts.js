const express = require('express');
const ensureAuth = require('../middleware/auth');
const User = require('../models/User');
const { notify } = require('../utils/acnotify');
const { queueCard } = require('../utils/accards');
const { PayoutSeason, PayoutAccount, PayoutRequest, enc, eligibility, scheduleFor, rawFor } = require('../utils/payout');
const router = express.Router();
router.use(ensureAuth);
const uid = req => String(req.user.id);
const io = req => req.app.get('io');
const bad = (res, code, message) => res.status(code).json({ message });
const now = () => new Date();
async function currentSeason() { return PayoutSeason.findOne({ status: { $in: ['scheduled', 'active'] }, startsAt: { $lte: now() }, endsAt: { $gte: now() } }).sort({ seasonNo: -1 }); }
function batchOf(season, n) { return (season.batches || []).find(b => Number(b.number) === Number(n)); }
async function userSummary(req, season) {
  const u = await User.findById(uid(req));
  if (!season) return { season: null, eligibility: null, account: await PayoutAccount.findOne({ user: uid(req) }).lean() };
  const e = await eligibility(u, season), a = e.account || await PayoutAccount.findOne({ user: uid(req) }).lean();
  let schedule = [];
  if (a && a.startingBatch) schedule = scheduleFor(a.startingBatch, 9).map((x, i) => ({ ...x, index: i, seasonNo: i === 0 ? 1 : 1 + Math.ceil(i / 2) }));
  const seasonSlots = schedule.filter(x => x.seasonNo === season.seasonNo);
  const requests = (await PayoutRequest.find({ user: uid(req), season: season._id }).sort({ slot: 1 }).lean()).map(x => ({ slot: x.slot, batch: x.batch, seasonNo: x.seasonNo, status: x.status, payoutAmount: x.payoutAmount, rawPayout: x.rawPayout, bankLast4: x.bankLast4, submittedAt: x.submittedAt, paidAt: x.paidAt, reference: x.status === 'paid' ? x.providerReference : '', reason: x.status === 'rejected' ? x.rejectionReason : '' }));   // adminNote stays private to the team
  if (e.eligible && (!a || !a.bankBoundAt) && (!a || !a.eligibilityNoticeAt || Date.now() - new Date(a.eligibilityNoticeAt).getTime() > 86400000)) {
    await notify(io(req), uid(req), { icon: '🏦', text: 'You are eligible for the current withdrawal season. Open AllConnect Pay → Withdrawals, bind your bank details, and submit during your scheduled batch.', kind: 'good', ref: 'u:payouts' }).catch(() => {});
    await PayoutAccount.updateOne({ user: uid(req) }, { $set: { eligibilityNoticeAt: new Date() } }, { upsert: true }).catch(() => {});
  }
  return { season: { id: season._id, seasonNo: season.seasonNo, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt, maxPayoutsPerSeason: season.maxPayoutsPerSeason, rules: season.rules, batches: season.batches }, eligibility: e, account: a, schedule: seasonSlots, requests };
}
router.get('/status', async (req, res, next) => { try { res.json(await userSummary(req, await currentSeason())); } catch (e) { next(e); } });
router.post('/select-batch', async (req, res, next) => {
  try {
    const season = await currentSeason(); if (!season) return bad(res, 409, 'There is no withdrawal season open right now.');
    const batch = Number(req.body && req.body.batch); if (![1, 2, 3].includes(batch)) return bad(res, 400, 'Choose Batch 1, 2 or 3.');
    let a = await PayoutAccount.findOne({ user: uid(req) });
    if (!a) a = await PayoutAccount.create({ user: uid(req), startingBatch: batch });
    else if (!a.startingBatch) { a.startingBatch = batch; a.updatedAt = now(); await a.save(); }
    if (a.startingBatch !== batch) return bad(res, 409, 'Your starting batch is already locked for this payout rotation.');
    await notify(io(req), uid(req), { icon: '🥥', text: `Your withdrawal rotation starts with Batch ${batch}. Choose carefully: future payout slots rotate automatically.`, kind: 'good', ref: 'u:payouts' });
    res.json(await userSummary(req, season));
  } catch (e) { next(e); }
});
router.post('/bank', async (req, res, next) => {
  try {
    const b = req.body || {}, bankName = String(b.bankName || '').trim().slice(0, 80), accountName = String(b.accountName || '').trim().slice(0, 100), number = String(b.accountNumber || '').replace(/\D/g, '');
    if (!bankName || !accountName || !/^\d{10}$/.test(number)) return bad(res, 400, 'Enter a bank name, account name and valid 10-digit account number.');
    const a = await PayoutAccount.findOneAndUpdate({ user: uid(req) }, { $set: { bankName, accountName, accountNumberCipher: enc(number), accountNumberLast4: number.slice(-4), bankBoundAt: now(), updatedAt: now() } }, { upsert: true, new: true });
    res.json({ ok: true, bank: { bankName: a.bankName, accountName: a.accountName, last4: a.accountNumberLast4 } });
  } catch (e) { next(e); }
});
router.post('/submit', async (req, res, next) => {
  try {
    const season = await currentSeason(); if (!season) return bad(res, 409, 'There is no withdrawal season open right now.');
    const a = await PayoutAccount.findOne({ user: uid(req) }); if (!a || !a.startingBatch) return bad(res, 409, 'Choose your first batch before submitting a withdrawal.');
    if (!a.bankBoundAt) return bad(res, 409, 'Bind your bank details in AllConnect Pay before submitting.');
    const u = await User.findById(uid(req)), e = await eligibility(u, season); if (!e.eligible) return bad(res, 403, 'You are not eligible yet. Open the eligibility details to see what to prepare.');
    const body = req.body || {}, slot = Number(body.slot); if (!Number.isInteger(slot) || slot < 0 || slot >= season.maxPayoutsPerSeason) return bad(res, 400, 'Invalid payout slot.');
    const schedule = scheduleFor(a.startingBatch, 9).map((x, i) => ({ ...x, index: i, seasonNo: i === 0 ? 1 : 1 + Math.ceil(i / 2) })).find(x => x.seasonNo === season.seasonNo && x.slotInSeason === slot);
    if (!schedule) return bad(res, 409, 'This payout slot is not available in the current rotation.');
    const batch = batchOf(season, schedule.batch); if (!batch || batch.status !== 'open') return bad(res, 409, 'This batch is not open. Your eligible balance will roll to the next scheduled slot.');
    const previous = await PayoutRequest.findOne({ user: uid(req), season: season._id, slot }); if (previous) return res.json({ request: previous, alreadySubmitted: true });
    const usedRows = await PayoutRequest.aggregate([{ $match: { user: uid(req), season: season._id, status: { $nin: ['rejected', 'rolled_over', 'failed'] } } }, { $group: { _id: null, units: { $sum: '$eligibleUnits' } } }]);
    const availableUnits = Math.max(0, e.units + Number(a.carriedUnits || 0) - Number(usedRows[0]?.units || 0));
    const raw = rawFor(availableUnits, batch); if (raw < Number(batch.minPayout || 0)) return bad(res, 403, `Your remaining eligible balance is below this batch's ₦${Number(batch.minPayout || 0).toLocaleString('en-NG')} minimum. Any rolled-over units can be used at the next scheduled slot.`);
    const countedUnits = Math.min(availableUnits, Number(batch.countedUnitsCap || 5000000));
    const r = await PayoutRequest.create({ user: uid(req), season: season._id, seasonNo: season.seasonNo, batch: schedule.batch, slot, eligibleUnits: countedUnits, rawPayout: raw, payoutAmount: Math.min(raw, Number(batch.maxPayout || raw)), bankLast4: a.accountNumberLast4, idempotencyKey: String(body.idempotencyKey || `${uid(req)}:${season._id}:${slot}`) });
    await notify(io(req), uid(req), { icon: '🏦', text: `Withdrawal submitted for Season ${season.seasonNo}, Batch ${schedule.batch}. Proceed to AllConnect Pay to review your bank details and wait for approval.`, kind: 'good', ref: 'u:payouts' });
    await queueCard(io(req), uid(req), { icon: '🏦', title: 'Withdrawal submitted', text: 'Your request is waiting for admin review. Your selected batch is locked for this slot.', tone: 'good', btn: 'View withdrawal', lines: [['Batch', `Season ${season.seasonNo} · Batch ${schedule.batch}`], ['Estimated', `₦${r.payoutAmount.toLocaleString('en-NG')}`]] });
    res.json({ request: r });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'This payout slot has already been submitted.' }); next(e); }
});
module.exports = router;
